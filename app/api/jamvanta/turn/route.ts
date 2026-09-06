import type { JamvantaAction, JamvantaTurn } from '../../../lib/jamvanta';
import { plainText } from '../../../lib/plain-text';
import { stationOptions } from '../../../lib/journey-engine';
import { ApiRequestError, apiError, enforceRateLimit, readJsonBody, requireSameOrigin, secureJson } from '../../../lib/api-security';

const MAX_BODY_BYTES = 24_000;
const allowedPaths = new Set(['/', '/about', '/planner', '/payment', '/ticket', '/comfort-score']);

const spokenAliases: Record<string, string[]> = {
  NDLS: ['delhi', 'नई दिल्ली', 'दिल्ली'], PNBE: ['patna', 'पटना'], CNB: ['kanpur', 'कानपुर'],
  DURG: ['दुर्ग'], R: ['raipur', 'रायपुर'], BRC: ['vadodara', 'baroda', 'वडोदरा', 'बड़ौदा'],
  CSMT: ['mumbai', 'bombay', 'मुंबई'], SBC: ['bengaluru', 'bangalore', 'बेंगलुरु'], MAS: ['chennai', 'madras', 'चेन्नई'],
  HYB: ['hyderabad', 'हैदराबाद'], HWH: ['howrah', 'kolkata', 'हावड़ा', 'कोलकाता'], BPL: ['bhopal', 'भोपाल'],
};

const normalizePhrase = (value: string) => value.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
const stationAliases = stationOptions.flatMap((station) => {
  const simplified = station.name.replace(/\b(junction|terminus|deccan|central)\b/gi, '').replace(/\s+/g, ' ').trim();
  return [...new Set([station.name, simplified, ...(station.code.length > 1 ? [station.code] : []), ...(spokenAliases[station.code] ?? [])])]
    .filter(Boolean)
    .map((alias) => ({ code: station.code, alias: normalizePhrase(alias) }));
}).sort((a, b) => b.alias.length - a.alias.length);

function stationIn(fragment: string) {
  const normalized = ` ${normalizePhrase(fragment)} `;
  return stationAliases.find(({ alias }) => normalized.includes(` ${alias} `))?.code;
}

function routeStations(text: string) {
  const normalized = normalizePhrase(text);
  const english = normalized.match(/(?:\bfrom\s+)?(.+?)\s+\bto\s+(.+?)(?=\s+\b(?:on|for|with|in|travelling|traveling|passengers?|people|class)\b|$)/i);
  const hindi = normalized.match(/(.+?)\s+से\s+(.+?)(?=\s+(?:को|के लिए|में|यात्री|लोग)|$)/i);
  const match = english ?? hindi;
  if (match) {
    const from = stationIn(match[1]);
    const to = stationIn(match[2]);
    return { from, to: to !== from ? to : undefined };
  }
  const padded = ` ${normalized} `;
  const matches = [...new Set(stationAliases.filter(({ alias }) => padded.includes(` ${alias} `)).map(({ code }) => code))];
  return { from: matches[0], to: matches.find((code) => code !== matches[0]) };
}

function travelClass(text: string) {
  const lower = normalizePhrase(text);
  if (/\b(?:ec|executive(?: chair car| class)?)\b/.test(lower)) return 'EC';
  if (/\b(?:1a|first class ac|first ac|1st class ac|one tier ac)\b/.test(lower)) return '1A';
  if (/\b(?:2a|2 tier ac|two tier ac|second tier ac)\b/.test(lower)) return '2A';
  if (/\b(?:3e|3 tier ac economy|three tier ac economy|ac economy)\b/.test(lower)) return '3E';
  if (/\b(?:3a|3 tier ac|three tier ac|third tier ac)\b/.test(lower)) return '3A';
  if (/\b(?:cc|ac chair car|chair car)\b/.test(lower)) return 'CC';
  if (/\b(?:sl|sleeper|sleeper class)\b/.test(lower)) return 'SL';
  return undefined;
}

function passengerCount(text: string) {
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, che: 6, chhe: 6 };
  const numeric = text.match(/\b([1-6])\s*(?:passengers?|people|travellers?|यात्री|लोग)/i);
  if (numeric) return Number(numeric[1]);
  const lower = text.toLowerCase();
  return Object.entries(words).find(([word]) => new RegExp(`\\b${word}\\b`).test(lower))?.[1];
}

function spokenDate(text: string) {
  const lower = text.toLowerCase();
  const now = new Date();
  const localToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const format = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  if (/day after tomorrow/.test(lower)) { const date = new Date(localToday); date.setDate(date.getDate() + 2); return format(date); }
  if (/tomorrow/.test(lower)) { const date = new Date(localToday); date.setDate(date.getDate() + 1); return format(date); }
  if (/today/.test(lower)) return format(localToday);
  const iso = lower.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const numeric = lower.match(/\b(0?[1-9]|[12]\d|3[01])[/-](0?[1-9]|1[0-2])(?:[/-](20\d{2}))?\b/);
  if (numeric) return `${numeric[3] ?? localToday.getFullYear()}-${numeric[2].padStart(2, '0')}-${numeric[1].padStart(2, '0')}`;
  const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  const monthPattern = months.join('|');
  const named = lower.match(new RegExp(`(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthPattern})(?:\\s+(20\\d{2}))?|(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d{2}))?`));
  if (named) {
    const day = Number(named[1] ?? named[5]);
    const month = months.indexOf(named[2] ?? named[4]);
    let year = Number(named[3] ?? named[6] ?? localToday.getFullYear());
    let date = new Date(year, month, day);
    if (!named[3] && !named[6] && date < localToday) date = new Date(++year, month, day);
    if (date.getMonth() === month && date.getDate() === day) return format(date);
  }
  return undefined;
}

function localTurn(transcript: string, pathname: string, spokenLanguage?: string): JamvantaTurn {
  const text = transcript.trim();
  const lower = text.toLowerCase();
  const hindi = spokenLanguage === 'hi-IN' || /[\u0900-\u097f]/.test(text);
  const language: JamvantaTurn['language'] = hindi ? 'hi-IN' : 'en-IN';
  const route = routeStations(text);
  let action: JamvantaAction | undefined;
  let reply = hindi ? 'मैं आपकी रेलसेतु यात्रा में मदद कर सकता हूँ।' : 'I can help with your RailSetu journey.';

  if (/download|save ticket|टिकट.*डाउनलोड|डाउनलोड.*टिकट/.test(lower)) {
    action = { type: 'download_ticket' };
    reply = hindi ? 'टिकट डाउनलोड शुरू कर रहा हूँ।' : 'Starting the ticket download.';
  } else if (/pay.*wallet|wallet.*pay|वॉलेट.*भुगतान|भुगतान.*वॉलेट/.test(lower)) {
    action = { type: 'pay_with_wallet', approvalId: crypto.randomUUID() };
    reply = hindi ? 'रेलसेतु वॉलेट से भुगतान करने से पहले आपकी मंज़ूरी चाहिए।' : 'I need your approval before paying from the RailSetu Wallet.';
    return { reply, language, action, requiresApproval: true, approvalLabel: 'Approve wallet payment' };
  } else if (pathname.includes('payment') && /(?:use|choose|select|pay).*(?:6756|visa)/.test(lower)) {
    action = { type: 'pay_with_method', mode: 'visa', label: 'Visa ending 6756', approvalId: crypto.randomUUID() };
    reply = hindi ? 'वीज़ा कार्ड, जिसके अंतिम अंक 6756 हैं, चुना गया है। भुगतान के लिए मंज़ूरी दें।' : 'Visa ending 6756 is selected. Approve when you are ready to pay.';
    return { reply, language, action, requiresApproval: true, approvalLabel: 'Approve Visa payment' };
  } else if (pathname.includes('payment') && /(?:use|choose|select|pay).*(?:4632|mastercard)/.test(lower)) {
    action = { type: 'pay_with_method', mode: 'mastercard', label: 'Mastercard ending 4632', approvalId: crypto.randomUUID() };
    reply = hindi ? 'मास्टरकार्ड, जिसके अंतिम अंक 4632 हैं, चुना गया है। भुगतान के लिए मंज़ूरी दें।' : 'Mastercard ending 4632 is selected. Approve when you are ready to pay.';
    return { reply, language, action, requiresApproval: true, approvalLabel: 'Approve Mastercard payment' };
  } else if (pathname.includes('payment') && /(?:use|choose|select).*(?:card)?.*\b(\d{4})\b/.test(lower)) {
    const last4 = lower.match(/\b(\d{4})\b/)?.[1] ?? '';
    action = { type: 'pay_with_method', mode: `card-${last4}`, label: `Card ending ${last4}`, approvalId: crypto.randomUUID() };
    reply = hindi ? `अंतिम अंक ${last4} वाला कार्ड चुना गया है। भुगतान के लिए मंज़ूरी दें।` : `The card ending ${last4} is selected. Approve when you are ready to pay.`;
    return { reply, language, action, requiresApproval: true, approvalLabel: 'Approve card payment' };
  } else if (pathname.includes('payment') && /(?:use|choose|select).*railsetu(?:\s+upi)?|railsetu@upi/.test(lower)) {
    action = { type: 'pay_with_method', mode: 'upi', label: 'UPI · railsetu@upi', approvalId: crypto.randomUUID() };
    reply = hindi ? 'रेलसेतु यूपीआई चुना गया है। भुगतान के लिए मंज़ूरी दें।' : 'RailSetu UPI is selected. Approve when you are ready to pay.';
    return { reply, language, action, requiresApproval: true, approvalLabel: 'Approve UPI payment' };
  } else if (pathname.includes('payment') && /(?:pay|payment).*(?:upi)|(?:upi).*(?:pay|payment)/.test(lower)) {
    action = { type: 'list_payment_methods', methodType: 'upi' };
    reply = hindi ? 'आपके सेव किए हुए यूपीआई विकल्प नीचे हैं। जिसे उपयोग करना है उसका नाम बोलें या चुनें।' : 'Here are your saved UPI options. Say or tap the one you want to use.';
  } else if (pathname.includes('payment') && /(?:pay|payment).*(?:card)|(?:card).*(?:pay|payment)/.test(lower)) {
    action = { type: 'list_payment_methods', methodType: 'card' };
    reply = hindi ? 'आपके सेव किए हुए कार्ड नीचे हैं। अंतिम चार अंक बोलें या कार्ड चुनें।' : 'Here are your saved cards. Say the last four digits or tap a card.';
  } else if (/continue|payment|भुगतान|आगे/.test(lower) && pathname.includes('planner')) {
    action = { type: 'continue_to_payment' };
    reply = hindi ? 'चुनी हुई यात्रा को भुगतान पेज पर ले जा रहा हूँ।' : 'Taking the selected journey to payment.';
  } else if (/home|मुख्य पृष्ठ/.test(lower)) {
    action = { type: 'navigate', path: '/' };
    reply = hindi ? 'मुख्य पृष्ठ खोल रहा हूँ।' : 'Opening the home page.';
  } else if (/about|रेलसेतु के बारे/.test(lower)) {
    action = { type: 'navigate', path: '/about' };
    reply = hindi ? 'रेलसेतु के बारे में पेज खोल रहा हूँ।' : 'Opening About RailSetu.';
  } else if (/plan|find|search|book|reserve|journey|train|यात्रा|ट्रेन|टिकट|ढूँढ|खोज|बुक/.test(lower) || (route.from && route.to)) {
    const from = route.from;
    const to = route.to;
    const date = spokenDate(text);
    const selectedClass = travelClass(text);
    const count = passengerCount(text);
    const completeRequest = Boolean(from && to && from !== to && date && selectedClass && count);
    action = {
      type: 'plan_journey',
      from,
      to,
      passengerCount: count,
      date,
      travelClass: selectedClass,
      search: completeRequest,
      autoContinue: completeRequest,
    };
    const missing = !from ? 'from' : !to || to === from ? 'to' : !date ? 'date' : !selectedClass ? 'class' : !count ? 'passengers' : null;
    if (missing) {
      const questions = hindi ? {
        from: 'आप कहाँ से यात्रा शुरू करना चाहते हैं?', to: 'आप किस स्टेशन तक जाना चाहते हैं?', date: 'आप किस तारीख को यात्रा करना चाहते हैं?', class: 'आप किस यात्रा श्रेणी में जाना चाहते हैं?', passengers: 'कितने यात्री सफ़र करेंगे?',
      } : {
        from: 'Which station are you travelling from?', to: 'Which station are you travelling to?', date: 'What date would you like to travel?', class: 'Which travel class would you like?', passengers: 'How many passengers are travelling?',
      };
      reply = questions[missing];
      return { reply, language, action, clarification: true };
    }
    reply = hindi ? 'सारी जानकारी मिल गई। अब सबसे अच्छा पूरा रास्ता खोज रहा हूँ।' : 'I have everything I need. Finding the best complete route now.';
  }

  return { reply, language, action };
}

type ConversationMessage = { role: 'user' | 'assistant'; text: string };

function conversationContext(history: ConversationMessage[], transcript: string) {
  const userTurns = history.filter((message) => message.role === 'user').map((message) => message.text).slice(-6);
  return [...userTurns, transcript].join('\n');
}

function mergeJourneyAction(remembered: Extract<JamvantaAction, { type: 'plan_journey' }>, current: Extract<JamvantaAction, { type: 'plan_journey' }>) {
  const suppliedNow = Object.fromEntries(Object.entries(current).filter(([, value]) => value !== undefined));
  return { ...remembered, ...suppliedNow } as Extract<JamvantaAction, { type: 'plan_journey' }>;
}

export async function POST(request: Request) {
  try {
  requireSameOrigin(request);
  const limited = enforceRateLimit(request, 'jamvanta-turn', 24);
  if (limited) return limited;
  const value = await readJsonBody(request, MAX_BODY_BYTES);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiRequestError(400, 'Invalid Jamvanta request.');
  const body = value as { transcript?: string; pathname?: string; spokenLanguage?: string; history?: ConversationMessage[] };
  const transcript = plainText(body.transcript);
  const requestedPath = String(body.pathname ?? '/').split('?')[0];
  const pathname = allowedPaths.has(requestedPath) ? requestedPath : '/';
  if (!transcript.trim()) return secureJson({ error: 'Transcript is required.' }, { status: 400 });

  const spokenLanguage = String(body.spokenLanguage ?? '');
  const history = Array.isArray(body.history)
    ? body.history.filter((message) => message && (message.role === 'user' || message.role === 'assistant') && typeof message.text === 'string').slice(-12).map((message) => ({ role: message.role, text: plainText(message.text) }))
    : [];
  const context = conversationContext(history, transcript);
  const currentTurn = localTurn(transcript, pathname, spokenLanguage);
  const rememberedTurn = localTurn(context, pathname, spokenLanguage);
  const hasRememberedJourney = rememberedTurn.action?.type === 'plan_journey';
  const suppliesJourneyDetail = Boolean(spokenDate(transcript) || passengerCount(transcript) || travelClass(transcript) || routeStations(transcript).from || routeStations(transcript).to);
  const fallback = (!currentTurn.action && hasRememberedJourney && suppliesJourneyDetail)
    ? { ...rememberedTurn, language: currentTurn.language }
    : currentTurn.action?.type === 'plan_journey' && hasRememberedJourney
      ? { ...currentTurn, action: mergeJourneyAction(rememberedTurn.action as Extract<JamvantaAction, { type: 'plan_journey' }>, currentTurn.action) }
      : currentTurn;
  if (!process.env.OPENAI_API_KEY) return secureJson({ ...fallback, mode: 'local-simulation' });
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? 'gpt-5-mini',
        instructions: 'You are Jamvanta, RailSetu’s hands-free travel copilot, not a generic chatbot. Mirror the user language (en-IN or hi-IN). Respond in one short, natural, action-led sentence. Say what you understood and what is happening next. If one essential detail is missing, ask only for that detail. Never re-ask for a station, date, class, or passenger count already present in the conversation. Do not introduce yourself, offer generic help, or routinely mention that RailSetu is a prototype. Mention limitations only if the user asks or if needed to avoid falsely claiming an external railway booking completed. When mentioning railway classes, say 3 tier AC, 2 tier AC, 1st class AC, AC chair car, executive chair car, or sleeper class; never pronounce 3A/2A/1A as amperes. Return only JSON matching the schema. The server separately chooses the permitted action.',
        input: `Page: ${pathname}\nOriginal spoken language: ${spokenLanguage || 'infer from text'}\nConversation in this browser session:\n${history.map((message) => `${message.role}: ${message.text}`).join('\n')}\nuser: ${transcript}\nReply only to the final user message while retaining all journey details already supplied in this session. Do not ask again for a station, date, class, or passenger count already present above.`,
        text: { format: { type: 'json_schema', name: 'jamvanta_turn', strict: true, schema: {
          type: 'object', additionalProperties: false,
          properties: {
            reply: { type: 'string' }, language: { type: 'string', enum: ['en-IN', 'hi-IN'] },
          }, required: ['reply', 'language'],
        } } },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error('provider request failed');
    const result = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    const raw = result.output_text ?? result.output?.flatMap((item) => item.content ?? []).find((item) => item.text)?.text;
    if (!raw) throw new Error('provider returned no result');
    const providerTurn = JSON.parse(raw) as Pick<JamvantaTurn, 'reply' | 'language'>;
    providerTurn.reply = plainText(providerTurn.reply);
    return secureJson({ ...fallback, ...providerTurn, reply: fallback.clarification ? fallback.reply : providerTurn.reply, mode: 'openai' });
  } catch {
    return secureJson({ ...fallback, mode: 'local-fallback' });
  }
  } catch (error) {
    return apiError(error, 'Jamvanta is temporarily unavailable.');
  }
}
