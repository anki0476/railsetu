import { ApiRequestError } from './api-security';
import {
  channelContext,
  createChannelCheckout,
  createChannelLink,
  holdChannelJourney,
  listChannelBookings,
  prepareChannelCancellation,
  quoteChannelCancellation,
  searchChannelJourneys,
  updateChannelContext,
} from './channel-service';
import { stationOptions, type JourneyQuery, type JourneySolution } from './journey-engine';
import type { ChannelRef } from './channel-store';
import { plainText } from './plain-text';
import { sha256 } from './reservation-store';

const MODEL = 'gpt-5.6-luna';
const MAX_AGENT_MS = 12_000;

type JourneyMemory = Partial<Pick<JourneyQuery, 'from' | 'to' | 'travelClass' | 'profile' | 'coachPreference' | 'luggage' | 'maxChanges' | 'lowerBerth'>> & {
  date?: string;
  passengerCount?: number;
  selectionStrategy?: 'best_fit' | 'highest_comfort' | 'lowest_fare' | 'fastest';
  optionIndex?: number;
  paymentMethod?: 'wallet' | 'upi' | 'visa' | 'mastercard';
};

type ConversationState = {
  memory: JourneyMemory;
  messages: Array<{ role: 'user' | 'assistant'; text: string }>;
  selectedOfferId?: string;
  reservationId?: string;
};

type AgentToolCall = { name: string; arguments: Record<string, unknown> };

const enumOrUndefined = <T extends string>(value: unknown, values: readonly T[]) =>
  typeof value === 'string' && values.includes(value as T) ? value as T : undefined;

function cleanState(value: unknown): ConversationState {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const memoryValue = raw.memory && typeof raw.memory === 'object' && !Array.isArray(raw.memory) ? raw.memory as Record<string, unknown> : {};
  const memory: JourneyMemory = {
    from: enumOrUndefined(memoryValue.from, stationOptions.map((station) => station.code)),
    to: enumOrUndefined(memoryValue.to, stationOptions.map((station) => station.code)),
    date: typeof memoryValue.date === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(memoryValue.date) ? memoryValue.date : undefined,
    passengerCount: Number.isInteger(memoryValue.passengerCount) && Number(memoryValue.passengerCount) >= 1 && Number(memoryValue.passengerCount) <= 6 ? Number(memoryValue.passengerCount) : undefined,
    travelClass: enumOrUndefined(memoryValue.travelClass, ['1A','2A','3A','3E','SL','CC','EC'] as const),
    profile: enumOrUndefined(memoryValue.profile, ['standard','elderly','family'] as const),
    coachPreference: enumOrUndefined(memoryValue.coachPreference, ['same','nearby','any'] as const),
    luggage: enumOrUndefined(memoryValue.luggage, ['none','light','heavy'] as const),
    maxChanges: Number.isInteger(memoryValue.maxChanges) && Number(memoryValue.maxChanges) >= 0 && Number(memoryValue.maxChanges) <= 8 ? Number(memoryValue.maxChanges) : undefined,
    lowerBerth: typeof memoryValue.lowerBerth === 'boolean' ? memoryValue.lowerBerth : undefined,
    selectionStrategy: enumOrUndefined(memoryValue.selectionStrategy, ['best_fit','highest_comfort','lowest_fare','fastest'] as const),
    optionIndex: Number.isInteger(memoryValue.optionIndex) && Number(memoryValue.optionIndex) >= 1 && Number(memoryValue.optionIndex) <= 6 ? Number(memoryValue.optionIndex) : undefined,
    paymentMethod: enumOrUndefined(memoryValue.paymentMethod, ['wallet','upi','visa','mastercard'] as const),
  };
  const messages = Array.isArray(raw.messages) ? raw.messages.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const message = item as Record<string, unknown>;
    if ((message.role !== 'user' && message.role !== 'assistant') || typeof message.text !== 'string') return [];
    return [{ role: message.role, text: plainText(message.text, 800) }];
  }).slice(-16) : [];
  return {
    memory,
    messages,
    selectedOfferId: typeof raw.selectedOfferId === 'string' ? raw.selectedOfferId : undefined,
    reservationId: typeof raw.reservationId === 'string' ? raw.reservationId : undefined,
  };
}

function missing(memory: JourneyMemory) {
  const fields: Array<[keyof JourneyMemory, string]> = [
    ['from','departure station'], ['to','destination station'], ['date','journey date'], ['travelClass','travel class'],
    ['passengerCount','passenger count'], ['profile','traveller type'], ['luggage','luggage type'],
    ['coachPreference','coach movement preference'], ['maxChanges','maximum seat changes'], ['lowerBerth','lower-berth preference'],
  ];
  return fields.filter(([key]) => memory[key] === undefined).map(([, label]) => label);
}

function queryFrom(memory: JourneyMemory): JourneyQuery {
  const absent = missing(memory);
  if (absent.length) throw new ApiRequestError(400, `Missing ${absent[0]}.`);
  const count = memory.passengerCount as number;
  return {
    from: memory.from as string,
    to: memory.to as string,
    travelClass: memory.travelClass as string,
    profile: memory.profile as JourneyQuery['profile'],
    coachPreference: memory.coachPreference as JourneyQuery['coachPreference'],
    luggage: memory.luggage as JourneyQuery['luggage'],
    maxChanges: memory.maxChanges as number,
    lowerBerth: memory.lowerBerth as boolean,
    passengers: Array.from({ length: count }, (_, index) => ({
      id: `passenger-${index + 1}`, name: `Passenger ${index + 1}`,
      profile: memory.profile as JourneyQuery['profile'], luggage: memory.luggage as JourneyQuery['luggage'],
      lowerBerth: memory.lowerBerth as boolean, companionId: null,
    })),
    groupStrategy: 'tiered',
    transitionMode: 'synchronised',
  };
}

function mergeMemory(memory: JourneyMemory, args: Record<string, unknown>) {
  const stationCodes = stationOptions.map((station) => station.code);
  const assign = <K extends keyof JourneyMemory>(key: K, value: JourneyMemory[K] | undefined) => { if (value !== undefined && value !== null) memory[key] = value; };
  assign('from', enumOrUndefined(args.from, stationCodes));
  assign('to', enumOrUndefined(args.to, stationCodes));
  if (typeof args.date === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(args.date)) assign('date', args.date);
  if (Number.isInteger(args.passenger_count) && Number(args.passenger_count) >= 1 && Number(args.passenger_count) <= 6) assign('passengerCount', Number(args.passenger_count));
  assign('travelClass', enumOrUndefined(args.travel_class, ['1A','2A','3A','3E','SL','CC','EC'] as const));
  assign('profile', enumOrUndefined(args.profile, ['standard','elderly','family'] as const));
  assign('coachPreference', enumOrUndefined(args.coach_preference, ['same','nearby','any'] as const));
  assign('luggage', enumOrUndefined(args.luggage, ['none','light','heavy'] as const));
  if (Number.isInteger(args.max_changes) && Number(args.max_changes) >= 0 && Number(args.max_changes) <= 8) assign('maxChanges', Number(args.max_changes));
  if (typeof args.lower_berth === 'boolean') assign('lowerBerth', args.lower_berth);
  assign('selectionStrategy', enumOrUndefined(args.selection_strategy, ['best_fit','highest_comfort','lowest_fare','fastest'] as const));
  if (Number.isInteger(args.option_index) && Number(args.option_index) >= 1 && Number(args.option_index) <= 6) assign('optionIndex', Number(args.option_index));
  assign('paymentMethod', enumOrUndefined(args.payment_method, ['wallet','upi','visa','mastercard'] as const));
  if (args.use_recommended_defaults === true) {
    memory.coachPreference ??= 'same';
    memory.maxChanges ??= 1;
    memory.lowerBerth ??= true;
  }
}

function solutionSummary(solution: JourneySolution, index: number) {
  const segments = solution.legs.map((leg) => `${leg.from.code}–${leg.to.code} ${leg.coach}/${leg.seat}`).join(', ');
  return `${index + 1}. ${solution.trainNumber} ${solution.trainName} · comfort ${solution.comfort}/100 · ₹${solution.fare} · ${solution.duration}\n   ${segments}`;
}

function chooseSolution(solutions: JourneySolution[], memory: JourneyMemory) {
  if (memory.optionIndex) return solutions[memory.optionIndex - 1];
  if (memory.selectionStrategy === 'highest_comfort') return [...solutions].sort((a,b) => b.comfort - a.comfort || a.fare - b.fare)[0];
  if (memory.selectionStrategy === 'lowest_fare') return [...solutions].sort((a,b) => a.fare - b.fare || b.comfort - a.comfort)[0];
  if (memory.selectionStrategy === 'fastest') {
    const minutes=(duration:string)=>{
      const hours=Number(duration.match(/(\d+)\s*h/i)?.[1]??0);
      const mins=Number(duration.match(/(\d+)\s*m/i)?.[1]??0);
      return hours*60+mins;
    };
    return [...solutions].sort((a,b)=>minutes(a.duration)-minutes(b.duration)||b.comfort-a.comfort)[0];
  }
  return solutions[0];
}

async function executeBookingGoal(args: Record<string, unknown>, state: ConversationState, ref: ChannelRef, messageId: string) {
  mergeMemory(state.memory, args);
  const absent = missing(state.memory);
  if (absent.length) {
    const field = absent[0];
    const options: Record<string, string> = {
      'traveller type': 'standard, elderly/limited mobility, or family',
      'luggage type': 'none, light, or heavy',
      'coach movement preference': 'same coach, nearby coach, or any coach',
      'maximum seat changes': 'zero, one, or more',
      'lower-berth preference': 'yes or no',
    };
    return `I have kept everything you already shared. What is your ${field}${options[field] ? `—${options[field]}?` : '?'}`;
  }

  const query = queryFrom(state.memory);
  const searched = await searchChannelJourneys({ channel: ref, date: state.memory.date, query }) as { outcome: { solutions: JourneySolution[]; recommendations?: Array<{ title:string; explanation:string }> } };
  if (!searched.outcome.solutions.length) {
    const recommendations = searched.outcome.recommendations?.slice(0, 3).map((item) => `• ${item.title}: ${item.explanation}`).join('\n');
    return `I couldn't find a confirmed journey under those exact preferences.${recommendations ? ` Here are the precise relaxations I can try:\n${recommendations}` : ' I will not invent availability.'}`;
  }
  const intent = enumOrUndefined(args.intent, ['search','book'] as const) ?? 'search';
  const selected = chooseSolution(searched.outcome.solutions, state.memory);
  state.selectedOfferId = selected?.id;
  const summaries = searched.outcome.solutions.slice(0, 3).map(solutionSummary).join('\n');
  if (intent === 'search' || !selected || (!state.memory.selectionStrategy && !state.memory.optionIndex)) {
    return `I found ${searched.outcome.solutions.length} confirmed option${searched.outcome.solutions.length === 1 ? '' : 's'}:\n${summaries}\nTell me which option to book, or say highest comfort or lowest fare.`;
  }
  if (!state.memory.paymentMethod) {
    return `I selected ${selected.trainNumber} ${selected.trainName} with comfort ${selected.comfort}/100 for ₹${selected.fare}. Which payment method should I prepare—UPI, wallet, Visa, or Mastercard?`;
  }

  const context = await channelContext({ channel: ref }) as { identity: { linked: boolean } };
  if (!context.identity.linked) {
    const link = await createChannelLink({ channel: ref }) as { url?: string; linked: boolean };
    return `I found and selected ${selected.trainNumber} ${selected.trainName}. Before I can hold the seats, securely link your RailSetu account here: ${link.url}\nI will continue from these saved details after linking.`;
  }
  const idempotencyKey = `wa_${(await sha256(messageId)).slice(0, 48)}`;
  const held = await holdChannelJourney({ channel: ref, date: state.memory.date, query, offerId: selected.id, idempotencyKey }) as { reservationId:string; expiresAt:number };
  state.reservationId = held.reservationId;
  const checkout = await createChannelCheckout({ channel: ref, reservationId: held.reservationId, paymentMethod: state.memory.paymentMethod }) as { url:string; amount:number; expiresAt:number };
  const seconds = Math.max(0, Math.floor((checkout.expiresAt - Date.now()) / 1000));
  return `I have held the complete itinerary for ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}. Fare: ₹${checkout.amount}. Open this secure RailSetu page to review and approve the ${state.memory.paymentMethod.toUpperCase()} payment: ${checkout.url}\nI cannot approve or charge it for you.`;
}

async function executeTool(call: AgentToolCall, state: ConversationState, ref: ChannelRef, messageId: string) {
  if (call.name === 'railsetu_booking_goal') return executeBookingGoal(call.arguments, state, ref, messageId);
  if (call.name === 'railsetu_link_account') {
    const link = await createChannelLink({ channel: ref }) as { linked:boolean; url?:string };
    return link.linked ? 'Your WhatsApp identity is already linked to RailSetu.' : `Securely link your RailSetu account here: ${link.url}`;
  }
  if (call.name === 'railsetu_booking_status') {
    const result = await listChannelBookings({ channel: ref }) as { bookings:Array<{bookingId:string;state:string;pnr?:string;ticketUrl?:string;itinerary:{train:string;fromName:string;toName:string}}> };
    const requested = typeof call.arguments.booking_id === 'string' ? result.bookings.find((item) => item.bookingId === call.arguments.booking_id) : result.bookings[0];
    if (!requested) return 'I could not find a booking on your linked RailSetu account.';
    return `${requested.itinerary.train}, ${requested.itinerary.fromName} to ${requested.itinerary.toName}: ${requested.state}${requested.pnr ? ` · PNR ${requested.pnr}` : ''}${requested.ticketUrl ? `\nTicket: ${requested.ticketUrl}` : ''}`;
  }
  if (call.name === 'railsetu_cancel_booking') {
    let bookingId = typeof call.arguments.booking_id === 'string' ? call.arguments.booking_id : '';
    if (!bookingId) {
      const recent=await listChannelBookings({channel:ref}) as {bookings:Array<{bookingId:string;state:string}>};
      bookingId=recent.bookings.find((booking)=>booking.state==='TICKET_ISSUED')?.bookingId??'';
    }
    if (!bookingId) return 'I could not find an issued ticket on your linked RailSetu account to cancel.';
    if (call.arguments.confirmed !== true) {
      const quote = await quoteChannelCancellation({ channel: ref, bookingId }) as { refund:number; cancellationFee:number; policy:string };
      return `The current cancellation quote is a ₹${quote.refund} refund with a ₹${quote.cancellationFee} fee. ${quote.policy} Reply with an explicit confirmation if you want me to prepare cancellation.`;
    }
    const prepared = await prepareChannelCancellation({ channel: ref, bookingId }) as { url:string; refund:number };
    return `Review the ₹${prepared.refund} refund and confirm cancellation on this secure RailSetu page: ${prepared.url}`;
  }
  return 'I can help with RailSetu journey planning, booking status, tickets, or cancellation. What would you like me to do?';
}

const tools = [
  {
    type:'function', name:'railsetu_booking_goal', description:'Capture all supplied journey details, remember them, search, select, hold, and prepare secure checkout in one operation whenever possible.', strict:true,
    parameters:{type:'object',properties:{
      intent:{type:'string',enum:['search','book']}, from:{type:['string','null'],enum:[...stationOptions.map((station)=>station.code),null]}, to:{type:['string','null'],enum:[...stationOptions.map((station)=>station.code),null]},
      date:{type:['string','null']}, passenger_count:{type:['integer','null'],minimum:1,maximum:6}, travel_class:{type:['string','null'],enum:['1A','2A','3A','3E','SL','CC','EC',null]},
      profile:{type:['string','null'],enum:['standard','elderly','family',null]}, luggage:{type:['string','null'],enum:['none','light','heavy',null]}, coach_preference:{type:['string','null'],enum:['same','nearby','any',null]},
      max_changes:{type:['integer','null'],minimum:0,maximum:8}, lower_berth:{type:['boolean','null']}, use_recommended_defaults:{type:'boolean'},
      selection_strategy:{type:['string','null'],enum:['best_fit','highest_comfort','lowest_fare','fastest',null]}, option_index:{type:['integer','null'],minimum:1,maximum:6},
      payment_method:{type:['string','null'],enum:['wallet','upi','visa','mastercard',null]},
    },required:['intent','from','to','date','passenger_count','travel_class','profile','luggage','coach_preference','max_changes','lower_berth','use_recommended_defaults','selection_strategy','option_index','payment_method'],additionalProperties:false},
  },
  {type:'function',name:'railsetu_link_account',description:'Create a secure account-link page.',strict:true,parameters:{type:'object',properties:{},required:[],additionalProperties:false}},
  {type:'function',name:'railsetu_booking_status',description:'Get the latest or a specified linked-account booking and issued ticket.',strict:true,parameters:{type:'object',properties:{booking_id:{type:['string','null']}},required:['booking_id'],additionalProperties:false}},
  {type:'function',name:'railsetu_cancel_booking',description:'Quote cancellation first, or prepare a confirmation link after explicit confirmation.',strict:true,parameters:{type:'object',properties:{booking_id:{type:['string','null']},confirmed:{type:'boolean'}},required:['booking_id','confirmed'],additionalProperties:false}},
] as const;

const policy = `You are Jamvanta, RailSetu's WhatsApp railway-booking agent. Speak naturally in first person and answer only as RailSetu's journey guide. Every incoming message must be understood by GPT-5.6 Luna before choosing exactly one restricted RailSetu tool.

Use railsetu_booking_goal for both one-shot and incremental planning. Copy every fact already present in authoritative memory into its arguments unless the user explicitly corrects it. Never ask for information already present. Understand Indian railway language and variants: third AC/3A/AC three tier means 3A; second AC means 2A; first AC means 1A. Resolve station names only to a code in the supplied catalogue. If genuinely ambiguous, pass null and let the tool ask.

Traveller type and luggage are subjective and must be asked separately when missing. “Recommended defaults” applies only to same coach, maximum one seat change, and lower berth enabled. For a one-shot booking with complete details, a selection rule, and an exact payment method, choose intent=book so the tool searches, selects, holds, and prepares checkout without extra confirmation. If the user only wants options, choose search. Never approve payment: every transaction requires the secure RailSetu approval page. Never invent availability, fare, PNR, booking state, refund, or tool success. Use booking-status and cancellation tools for those requests.`;

async function reason(message: string, state: ConversationState, linked: boolean, signal: AbortSignal): Promise<AgentToolCall> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method:'POST', signal,
    headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'content-type':'application/json'},
    body:JSON.stringify({
      model:MODEL,
      instructions:`${policy}\nToday in India is ${new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})}. Station catalogue: ${stationOptions.map((station)=>`${station.name} (${station.code})`).join(', ')}.`,
      input:JSON.stringify({message,linked,authoritativeMemory:state.memory,recentConversation:state.messages.slice(-10)}),
      tools,tool_choice:'required',parallel_tool_calls:false,reasoning:{effort:'low'},text:{verbosity:'low'},max_output_tokens:900,
    }),
  });
  if (!response.ok) throw new Error(`OpenAI returned ${response.status}: ${plainText(await response.text(),400)}`);
  const result = await response.json() as {output?:Array<{type?:string;name?:string;arguments?:string}>};
  const call = result.output?.find((item)=>item.type==='function_call' && item.name && typeof item.arguments==='string');
  if (!call?.name || typeof call.arguments !== 'string') throw new Error('Luna did not select a RailSetu tool.');
  return {name:call.name,arguments:JSON.parse(call.arguments) as Record<string,unknown>};
}

export async function runNativeWhatsAppAgent(message: string, ref: ChannelRef, messageId: string) {
  if (!process.env.OPENAI_API_KEY) throw new ApiRequestError(503, 'OpenAI reasoning is not configured.');
  const context = await channelContext({channel:ref}) as {identity:{linked:boolean};conversation:{state:unknown;version:number}};
  const state = cleanState(context.conversation.state);
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(),MAX_AGENT_MS);
  let reply: string;
  try {
    const call = await reason(message,state,context.identity.linked,controller.signal);
    reply = await executeTool(call,state,ref,messageId);
  } finally {
    clearTimeout(timeout);
  }
  state.messages.push({role:'user',text:plainText(message,800)},{role:'assistant',text:plainText(reply,1_500)});
  state.messages = state.messages.slice(-16);
  await updateChannelContext({channel:ref,state,expectedVersion:context.conversation.version});
  return reply;
}
