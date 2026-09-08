import type { JamvantaAction, JamvantaMemory, JamvantaSelectionStrategy, JamvantaTurn } from '../../../lib/jamvanta';
import { plainText } from '../../../lib/plain-text';
import { stationOptions } from '../../../lib/journey-engine';
import { ApiRequestError, apiError, enforceRateLimit, readJsonBody, requireSameOrigin, secureJson } from '../../../lib/api-security';

const MAX_BODY_BYTES = 32_000;
const allowedPaths = new Set(['/', '/about', '/planner', '/payment', '/ticket', '/comfort-score', '/updates']);
const travelClasses = new Set(['1A', '2A', '3A', '3E', 'CC', 'EC', 'SL']);
const selectionStrategies = new Set<JamvantaSelectionStrategy>(['best_fit', 'highest_comfort', 'lowest_fare', 'fastest']);

const spokenAliases: Record<string, string[]> = {
  NDLS: ['delhi', 'new delhi', 'नई दिल्ली', 'दिल्ली'], PNBE: ['patna', 'पटना'], CNB: ['kanpur', 'कानपुर'],
  DURG: ['durg', 'दुर्ग'], R: ['raipur', 'रायपुर'], BRC: ['vadodara', 'baroda', 'वडोदरा', 'बड़ौदा'],
  CSMT: ['mumbai', 'bombay', 'मुंबई'], SBC: ['bengaluru', 'bangalore', 'बेंगलुरु'], MAS: ['chennai', 'madras', 'चेन्नई'],
  HYB: ['hyderabad', 'हैदराबाद'], HWH: ['howrah', 'kolkata', 'हावड़ा', 'कोलकाता'], BPL: ['bhopal', 'भोपाल'],
};

const normalizePhrase = (value: string) => value.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
const stationAliases = stationOptions.flatMap((station) => {
  const simplified = station.name.replace(/\b(junction|terminus|deccan|central)\b/gi, '').replace(/\s+/g, ' ').trim();
  return [...new Set([station.name, simplified, ...(station.code.length > 1 ? [station.code] : []), ...(spokenAliases[station.code] ?? [])])]
    .filter(Boolean).map((alias) => ({ code: station.code, alias: normalizePhrase(alias) }));
}).sort((a, b) => b.alias.length - a.alias.length);

function stationIn(fragment: string) {
  const directCode = stationOptions.find((station) => station.code.toLowerCase() === fragment.trim().toLowerCase());
  if (directCode) return directCode.code;
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
  if (/\b(?:1\s*a|first class ac|first ac|1st class ac|one (?:tier|tear) ac|ac (?:1|one) (?:tier|tear))\b/.test(lower)) return '1A';
  if (/\b(?:2\s*a|2 (?:tier|tear) ac|two (?:tier|tear) ac|second (?:tier|tear) ac|ac (?:2|two) (?:tier|tear))\b/.test(lower)) return '2A';
  if (/\b(?:3\s*e|3 (?:tier|tear) ac economy|three (?:tier|tear) ac economy|ac economy)\b/.test(lower)) return '3E';
  if (/\b(?:3\s*a|3 (?:tier|tear) ac|three (?:tier|tear) ac|third (?:tier|tear) ac|ac (?:3|three) (?:tier|tear))\b/.test(lower)) return '3A';
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

function travellerProfile(text: string): JamvantaMemory['journey']['profile'] {
  const lower = normalizePhrase(text);
  if (/elderly|senior|limited mobility|old passenger|बुजुर्ग|वरिष्ठ/.test(lower)) return 'elderly';
  if (/family|children|child|kids|परिवार|बच्च/.test(lower)) return 'family';
  if (/standard traveller|regular traveller|adult traveller/.test(lower)) return 'standard';
  return undefined;
}

function coachPreference(text: string): JamvantaMemory['journey']['coachPreference'] {
  const lower = normalizePhrase(text);
  if (/no coach change|same coach|एक ही कोच/.test(lower)) return 'same';
  if (/nearby coach|adjacent coach|पास.*कोच/.test(lower)) return 'nearby';
  if (/any coach|coach does not matter|कोई भी कोच/.test(lower)) return 'any';
  return undefined;
}

function luggageLevel(text: string): JamvantaMemory['journey']['luggage'] {
  const lower = normalizePhrase(text);
  if (/heavy luggage|lots of luggage|भारी सामान/.test(lower)) return 'heavy';
  if (/no luggage|without luggage|सामान नहीं/.test(lower)) return 'none';
  if (/light luggage|manageable luggage|हल्का सामान/.test(lower)) return 'light';
  return undefined;
}

function lowerBerthPreference(text: string) {
  const lower = normalizePhrase(text);
  if (/no lower berth|do not need lower berth|lower berth नहीं/.test(lower)) return false;
  if (/lower berth|नीचे.*बर्थ|लोअर बर्थ/.test(lower)) return true;
  return undefined;
}

function maximumChanges(text: string) {
  const lower = normalizePhrase(text);
  if (/no (?:seat )?changes?|direct only|बिना.*बदल/.test(lower)) return 0;
  if (/any (?:number of )?(?:seat )?changes?|as many (?:seat )?changes?|changes? (?:do not|does not|don'?t) matter/.test(lower)) return 8;
  const numeric = lower.match(/(?:maximum|max|up to)\s*([0-8])\s*(?:seat )?changes?/);
  if (numeric) return Number(numeric[1]);
  if (/one (?:seat )?change/.test(lower)) return 1;
  if (/two (?:seat )?changes/.test(lower)) return 2;
  return undefined;
}

function spokenDate(text: string) {
  const lower = text.toLowerCase();
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
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
  const named = lower.match(new RegExp(`(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${months.join('|')})(?:\\s+(20\\d{2}))?|(${months.join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d{2}))?`));
  if (!named) return undefined;
  const day = Number(named[1] ?? named[5]);
  const month = months.indexOf(named[2] ?? named[4]);
  let year = Number(named[3] ?? named[6] ?? localToday.getFullYear());
  let date = new Date(year, month, day);
  if (!named[3] && !named[6] && date < localToday) date = new Date(++year, month, day);
  return date.getMonth() === month && date.getDate() === day ? format(date) : undefined;
}

function selectionStrategy(text: string): JamvantaSelectionStrategy | undefined {
  const lower = normalizePhrase(text);
  if (/highest|most comfortable|best comfort|अधिकतम.*आराम|सबसे.*आराम/.test(lower)) return 'highest_comfort';
  if (/cheapest|lowest fare|least expensive|सस्ता|कम किराया/.test(lower)) return 'lowest_fare';
  if (/fastest|quickest|shortest time|जल्दी|तेज़/.test(lower)) return 'fastest';
  if (/best|recommended|top option|बेहतरीन/.test(lower)) return 'best_fit';
  return undefined;
}

function optionIndex(text: string) {
  const match = normalizePhrase(text).match(/(?:option|journey|route)\s*(?:number\s*)?([1-4])|(?:first|पहला)|(?:second|दूसरा)|(?:third|तीसरा)|(?:fourth|चौथा)/);
  if (!match) return undefined;
  if (/first|पहला/.test(match[0])) return 1;
  if (/second|दूसरा/.test(match[0])) return 2;
  if (/third|तीसरा/.test(match[0])) return 3;
  if (/fourth|चौथा/.test(match[0])) return 4;
  return Number(match[1]);
}

function cleanMemory(value: unknown, pathname: string): JamvantaMemory {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<JamvantaMemory> : {};
  const journey = raw.journey && typeof raw.journey === 'object' ? raw.journey : {};
  const payment = raw.payment && typeof raw.payment === 'object' ? raw.payment : {};
  const from = typeof journey.from === 'string' && stationOptions.some((station) => station.code === journey.from) ? journey.from : undefined;
  const to = typeof journey.to === 'string' && stationOptions.some((station) => station.code === journey.to) ? journey.to : undefined;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const date = typeof journey.date === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(journey.date) && journey.date >= today ? journey.date : undefined;
  const count = Number(journey.passengerCount);
  const strategy = selectionStrategies.has(journey.selectionStrategy as JamvantaSelectionStrategy) ? journey.selectionStrategy as JamvantaSelectionStrategy : undefined;
  const index = Number(journey.optionIndex);
  return {
    journey: { from, to, date, passengerCount: Number.isInteger(count) && count >= 1 && count <= 6 ? count : undefined, travelClass: typeof journey.travelClass === 'string' && travelClasses.has(journey.travelClass) ? journey.travelClass : undefined, profile: journey.profile === 'standard' || journey.profile === 'elderly' || journey.profile === 'family' ? journey.profile : undefined, coachPreference: journey.coachPreference === 'same' || journey.coachPreference === 'nearby' || journey.coachPreference === 'any' ? journey.coachPreference : undefined, luggage: journey.luggage === 'none' || journey.luggage === 'light' || journey.luggage === 'heavy' ? journey.luggage : undefined, lowerBerth: typeof journey.lowerBerth === 'boolean' ? journey.lowerBerth : undefined, maxChanges: Number.isInteger(Number(journey.maxChanges)) && Number(journey.maxChanges) >= 0 && Number(journey.maxChanges) <= 8 ? Number(journey.maxChanges) : undefined, preferencesConfirmed: journey.preferencesConfirmed === true, selectionStrategy: strategy, optionIndex: Number.isInteger(index) && index >= 1 && index <= 4 ? index : undefined },
    payment: { methodType: payment.methodType === 'wallet' || payment.methodType === 'upi' || payment.methodType === 'card' ? payment.methodType : undefined, mode: typeof payment.mode === 'string' ? plainText(payment.mode, 80) : undefined, label: typeof payment.label === 'string' ? plainText(payment.label, 80) : undefined },
    stage: raw.stage && ['collecting','preferences','searching','selecting','payment','approval','ticket'].includes(raw.stage) ? raw.stage : 'collecting',
    lastPath: pathname,
  };
}

function enrichMemory(memory: JamvantaMemory, transcript: string) {
  const route = routeStations(transcript);
  const date = spokenDate(transcript);
  const selectedClass = travelClass(transcript);
  const count = passengerCount(transcript);
  const strategy = selectionStrategy(transcript);
  const index = optionIndex(transcript);
  const profile = travellerProfile(transcript);
  const coach = coachPreference(transcript);
  const luggage = luggageLevel(transcript);
  const lowerBerth = lowerBerthPreference(transcript);
  const maxChanges = maximumChanges(transcript);
  const preferenceAnswer = Boolean(profile || coach || luggage || typeof lowerBerth === 'boolean' || typeof maxChanges === 'number');
  const acceptsDefaults = /\b(?:(?:use|keep|go with)\s+(?:the )?)?(?:recommended|default|usual)(?:\s+(?:settings|preferences|options|defaults))?\b|\b(?:use|keep) (?:them|those)\b|\b(?:they|those) (?:are )?fine\b|\bno (?:special |specific )?preferences?\b|\byou (?:can )?(?:decide|choose)\b|\banything is fine\b/.test(normalizePhrase(transcript));
  const confirmsPreferences = memory.stage === 'preferences' && (preferenceAnswer || acceptsDefaults);
  memory.journey = { ...memory.journey, ...(route.from ? { from: route.from } : {}), ...(route.to ? { to: route.to } : {}), ...(date ? { date } : {}), ...(selectedClass ? { travelClass: selectedClass } : {}), ...(count ? { passengerCount: count } : {}), ...(profile ? { profile } : {}), ...(coach ? { coachPreference: coach } : {}), ...(luggage ? { luggage } : {}), ...(typeof lowerBerth === 'boolean' ? { lowerBerth } : {}), ...(typeof maxChanges === 'number' ? { maxChanges } : {}), ...(confirmsPreferences ? { preferencesConfirmed: true } : {}), ...(strategy ? { selectionStrategy: strategy } : {}), ...(index ? { optionIndex: index } : {}) };
  if (confirmsPreferences) {
    memory.journey = {
      ...memory.journey,
      profile: memory.journey.profile ?? 'elderly',
      coachPreference: memory.journey.coachPreference ?? 'same',
      luggage: memory.journey.luggage ?? 'light',
      lowerBerth: memory.journey.lowerBerth ?? true,
      maxChanges: memory.journey.maxChanges ?? 1,
      preferencesConfirmed: true,
    };
  }
  return memory;
}

function missingJourneyField(memory: JamvantaMemory) {
  if (!memory.journey.from) return 'departure station';
  if (!memory.journey.to || memory.journey.to === memory.journey.from) return 'destination station';
  if (!memory.journey.date) return 'journey date';
  if (!memory.journey.travelClass) return 'travel class';
  if (!memory.journey.passengerCount) return 'passenger count';
  return null;
}

function journeyAction(memory: JamvantaMemory, autoContinue: boolean): Extract<JamvantaAction, { type: 'plan_journey' }> {
  const missing = missingJourneyField(memory);
  return { type: 'plan_journey', ...memory.journey, search: !missing, autoContinue: !missing && autoContinue };
}

function preferenceQuestion(memory: JamvantaMemory, hindi: boolean) {
  const missing: string[] = [];
  if (!memory.journey.profile) missing.push('traveller type');
  if (!memory.journey.luggage) missing.push('luggage');
  if (!memory.journey.coachPreference) missing.push('coach movement');
  if (typeof memory.journey.maxChanges !== 'number') missing.push('maximum seat changes');
  if (typeof memory.journey.lowerBerth !== 'boolean') missing.push('lower-berth preference');
  if (hindi) return 'खोजने से पहले अपनी यात्रा प्राथमिकताएँ बताइए—यात्री का प्रकार, सामान, कोच बदलना, अधिकतम सीट बदलाव और लोअर बर्थ। आप “recommended defaults” भी कह सकते हैं।';
  if (!missing.length) return 'Before I search, should I use your saved traveller, luggage, coach-movement, seat-change and lower-berth preferences, or would you like to change them?';
  return `Before I search, tell me your ${missing.join(', ')}. You can answer them together, or say “use recommended defaults”.`;
}

function localTurn(transcript: string, pathname: string, spokenLanguage: string, memory: JamvantaMemory): JamvantaTurn {
  const lower = normalizePhrase(transcript);
  const hindi = spokenLanguage === 'hi-IN' || /[\u0900-\u097f]/.test(transcript);
  const language: JamvantaTurn['language'] = hindi ? 'hi-IN' : 'en-IN';
  const finish = (reply: string, action?: JamvantaAction, extra: Partial<JamvantaTurn> = {}): JamvantaTurn => ({ reply, language, action, memory, ...extra });
  if (/download|save ticket|टिकट.*डाउनलोड|डाउनलोड.*टिकट/.test(lower)) return finish(hindi ? 'आपका टिकट डाउनलोड कर रहा हूँ।' : 'Downloading your ticket now.', { type: 'download_ticket' });
  if (pathname === '/payment') {
    if (/wallet|वॉलेट/.test(lower)) {
      memory.payment = { methodType: 'wallet', mode: 'wallet', label: 'RailSetu Wallet' }; memory.stage = 'approval';
      return finish(hindi ? 'रेलसेतु वॉलेट से भुगतान के लिए आपकी मंज़ूरी चाहिए।' : 'RailSetu Wallet is ready. Please approve this payment.', { type: 'pay_with_wallet', approvalId: crypto.randomUUID() }, { requiresApproval: true, approvalLabel: 'Approve wallet payment' });
    }
    const isUpi = /upi|यूपीआई/.test(lower);
    const isCard = /card|visa|mastercard|6756|4632|कार्ड/.test(lower);
    if (isUpi || isCard) {
      const methodType = isUpi ? 'upi' : 'card';
      const lastFour = lower.match(/\b(\d{4})\b/)?.[1];
      const choice = isUpi && /railsetu|use it|yes|हाँ|हां/.test(lower) ? { mode: 'upi', label: 'UPI · railsetu@upi' } : /6756|visa/.test(lower) ? { mode: 'visa', label: 'Visa ending 6756' } : /4632|mastercard/.test(lower) ? { mode: 'mastercard', label: 'Mastercard ending 4632' } : lastFour ? { mode: `card-${lastFour}`, label: `Card ending ${lastFour}` } : null;
      memory.payment = { methodType, ...(choice ?? {}) };
      memory.stage = 'payment';
      if (choice) {
        memory.stage = 'approval';
        return finish(`${choice.label} is ready. Please approve this payment.`, { type: 'pay_with_method', ...choice, approvalId: crypto.randomUUID() }, { requiresApproval: true, approvalLabel: `Approve ${methodType} payment` });
      }
      return finish(isUpi ? 'Here is your saved UPI option. Choose it or add your own.' : 'Here are your saved cards. Choose one or add another card.', { type: 'list_payment_methods', methodType });
    }
  }
  const suppliesJourneyDetail = Boolean(routeStations(transcript).from || routeStations(transcript).to || spokenDate(transcript) || travelClass(transcript) || passengerCount(transcript) || travellerProfile(transcript) || coachPreference(transcript) || luggageLevel(transcript) || typeof lowerBerthPreference(transcript) === 'boolean' || typeof maximumChanges(transcript) === 'number');
  if (pathname === '/planner' && !suppliesJourneyDetail && (selectionStrategy(transcript) || optionIndex(transcript)) && /highest|cheapest|lowest fare|fastest|option|journey|route/.test(lower)) {
    memory.stage = 'selecting';
    return finish('I’ll use that journey preference and continue with the matching option.', { type: 'select_journey', strategy: memory.journey.selectionStrategy ?? 'best_fit', optionIndex: memory.journey.optionIndex, autoContinue: true });
  }
  if (/plan|find|search|book|reserve|journey|train|ticket|यात्रा|ट्रेन|टिकट|ढूँढ|खोज|बुक/.test(lower) || routeStations(transcript).from || Object.values(memory.journey).some(Boolean)) {
    const missing = missingJourneyField(memory);
    if (missing) {
      memory.stage = 'collecting';
      return finish(hindi ? `मुझे आपकी ${missing} की जानकारी चाहिए। कृपया बताइए।` : `I have the details you already shared. What is the ${missing}?`, journeyAction(memory, false), { clarification: true });
    }
    if (!memory.journey.preferencesConfirmed) {
      memory.stage = 'preferences';
      return finish(preferenceQuestion(memory, hindi), { type: 'plan_journey', ...memory.journey, search: false, autoContinue: false }, { clarification: true });
    }
    memory.stage = 'searching';
    return finish(hindi ? 'सारी जानकारी मिल गई। सबसे उपयुक्त यात्रा चुनकर भुगतान तक ले जा रहा हूँ।' : 'I have every detail. Finding the right journey and taking it to payment.', journeyAction(memory, true));
  }
  return finish(hindi ? 'बताइए कि रेलसेतु पर आगे क्या करना है।' : 'Tell me what you would like me to do next in RailSetu.');
}

type ToolCall = { name: string; arguments: Record<string, unknown> };

function toolToTurn(call: ToolCall, fallback: JamvantaTurn, memory: JamvantaMemory, pathname: string): JamvantaTurn {
  const args = call.arguments;
  const reply = plainText(args.say ?? fallback.reply, 360).trim() || fallback.reply;
  const language = /[\u0900-\u097f]/.test(reply) ? 'hi-IN' : fallback.language;
  const base = { reply, language, memory } satisfies Pick<JamvantaTurn, 'reply' | 'language' | 'memory'>;
  if (call.name === 'journey_planner') {
    const from = stationIn(String(args.from ?? ''));
    const to = stationIn(String(args.to ?? ''));
    const count = Number(args.passenger_count);
    const requestedClass = String(args.travel_class ?? '').toUpperCase();
    const strategy = String(args.selection_strategy ?? '') as JamvantaSelectionStrategy;
    // Option numbers are consequential: only retain one that the user's utterance
    // already placed in memory. This prevents the model from inventing "option 1"
    // while the user actually asked for a comparison such as highest comfort.
    const index = Number(memory.journey.optionIndex);
    const maxChanges = Number(args.max_changes);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    memory.journey = { ...memory.journey, ...(from ? { from } : {}), ...(to ? { to } : {}), ...(typeof args.date === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(args.date) && args.date >= today ? { date: args.date } : {}), ...(Number.isInteger(count) && count >= 1 && count <= 6 ? { passengerCount: count } : {}), ...(travelClasses.has(requestedClass) ? { travelClass: requestedClass } : {}), ...(args.profile === 'standard' || args.profile === 'elderly' || args.profile === 'family' ? { profile: args.profile } : {}), ...(args.coach_preference === 'same' || args.coach_preference === 'nearby' || args.coach_preference === 'any' ? { coachPreference: args.coach_preference } : {}), ...(args.luggage === 'none' || args.luggage === 'light' || args.luggage === 'heavy' ? { luggage: args.luggage } : {}), ...(typeof args.lower_berth === 'boolean' ? { lowerBerth: args.lower_berth } : {}), ...(Number.isInteger(maxChanges) && maxChanges >= 0 && maxChanges <= 8 ? { maxChanges } : {}), ...(selectionStrategies.has(strategy) ? { selectionStrategy: strategy } : {}), ...(Number.isInteger(index) && index >= 1 && index <= 4 ? { optionIndex: index } : {}) };
    const missing = missingJourneyField(memory);
    memory.stage = missing ? 'collecting' : 'searching';
    const naturalReply = missing
      ? (language === 'hi-IN' ? `आपकी पहले दी हुई जानकारी मेरे पास है। ${missing} क्या है?` : `I have the details you already shared. What is the ${missing}?`)
      : (language === 'hi-IN' ? 'सारी जानकारी मिल गई। सबसे उपयुक्त यात्रा चुनकर भुगतान तक ले जा रहा हूँ।' : 'I have every detail. Finding the right journey and taking it to payment.');
    return { ...base, reply: naturalReply, action: journeyAction(memory, args.auto_continue !== false), clarification: Boolean(missing) };
  }
  if (call.name === 'select_journey') {
    const strategy = selectionStrategies.has(String(args.strategy) as JamvantaSelectionStrategy) ? String(args.strategy) as JamvantaSelectionStrategy : memory.journey.selectionStrategy ?? 'best_fit';
    const index = Number(args.option_index);
    memory.journey.selectionStrategy = strategy;
    if (Number.isInteger(index) && index >= 1 && index <= 4 && memory.journey.optionIndex === index) memory.journey.optionIndex = index;
    memory.stage = 'selecting';
    return { ...base, reply: language === 'hi-IN' ? 'आपकी पसंद के अनुसार यात्राओं की तुलना करके सही विकल्प चुन रहा हूँ।' : 'I’ll compare the journeys using that preference and choose the matching option.', action: { type: 'select_journey', strategy, optionIndex: memory.journey.optionIndex, autoContinue: args.continue_to_payment !== false } };
  }
  if (call.name === 'payment_gateway') {
    if (pathname !== '/payment') return { ...base, reply: language === 'hi-IN' ? 'पहले यात्रा चुनते हैं, फिर मैं भुगतान पूरा करूँगा।' : 'First I need to select and hold the journey; then I can complete payment.' };
    const methodType = args.method_type === 'wallet' || args.method_type === 'upi' || args.method_type === 'card' ? args.method_type : undefined;
    const intent = String(args.intent ?? 'list');
    const mode = plainText(args.mode, 80).trim();
    const label = plainText(args.label, 80).trim();
    memory.payment = { methodType, mode: mode || undefined, label: label || undefined };
    memory.stage = 'payment';
    if (intent === 'add' && methodType && methodType !== 'wallet') return { ...base, action: { type: 'add_payment_method', methodType } };
    if ((intent === 'pay' || intent === 'select') && methodType === 'wallet') {
      memory.stage = 'approval';
      return { ...base, reply: language === 'hi-IN' ? 'रेलसेतु वॉलेट तैयार है। भुगतान के लिए कृपया मंज़ूरी दें।' : 'RailSetu Wallet is ready. Please approve this payment.', action: { type: 'pay_with_wallet', approvalId: crypto.randomUUID() }, requiresApproval: true, approvalLabel: 'Approve wallet payment' };
    }
    if ((intent === 'pay' || intent === 'select') && (methodType === 'upi' || methodType === 'card') && mode && label) {
      memory.stage = 'approval';
      return { ...base, reply: language === 'hi-IN' ? `${label} तैयार है। भुगतान के लिए कृपया मंज़ूरी दें।` : `${label} is ready. Please approve this payment.`, action: { type: 'pay_with_method', mode, label, approvalId: crypto.randomUUID() }, requiresApproval: true, approvalLabel: `Approve ${methodType} payment` };
    }
    if (methodType === 'upi' || methodType === 'card') return { ...base, action: { type: 'list_payment_methods', methodType } };
    return { ...base, reply: language === 'hi-IN' ? 'यूपीआई, सेव कार्ड या रेलसेतु वॉलेट में से चुनें।' : 'Choose UPI, a saved card, or RailSetu Wallet.' };
  }
  if (call.name === 'download_ticket') {
    memory.stage = 'ticket';
    return pathname === '/ticket' ? { ...base, action: { type: 'download_ticket' } } : { ...base, reply: language === 'hi-IN' ? 'टिकट भुगतान के बाद डाउनलोड होगा।' : 'The ticket becomes available to download after payment is confirmed.' };
  }
  if (call.name === 'navigate') {
    const path = args.path === '/' || args.path === '/about' || args.path === '/planner' ? args.path : '/planner';
    return { ...base, action: { type: 'navigate', path } };
  }
  return { ...base, clarification: true };
}

const tools = [
  { type: 'function', name: 'journey_planner', description: 'Collect remembered journey and comfort details, fill the planner, search, and optionally continue automatically.', parameters: { type: 'object', properties: { say: { type: 'string' }, from: { type: ['string','null'], description: 'Station name or code' }, to: { type: ['string','null'], description: 'Station name or code' }, date: { type: ['string','null'], description: 'YYYY-MM-DD' }, passenger_count: { type: ['integer','null'], minimum: 1, maximum: 6 }, travel_class: { type: ['string','null'], enum: ['1A','2A','3A','3E','CC','EC','SL',null] }, profile: { type: ['string','null'], enum: ['standard','elderly','family',null] }, coach_preference: { type: ['string','null'], enum: ['same','nearby','any',null] }, luggage: { type: ['string','null'], enum: ['none','light','heavy',null] }, lower_berth: { type: ['boolean','null'] }, max_changes: { type: ['integer','null'], minimum: 0, maximum: 8 }, selection_strategy: { type: ['string','null'], enum: ['best_fit','highest_comfort','lowest_fare','fastest',null] }, option_index: { type: ['integer','null'], minimum: 1, maximum: 4 }, auto_continue: { type: 'boolean' } }, required: ['say','from','to','date','passenger_count','travel_class','profile','coach_preference','luggage','lower_berth','max_changes','selection_strategy','option_index','auto_continue'], additionalProperties: false }, strict: true },
  { type: 'function', name: 'select_journey', description: 'Compare displayed journeys by comfort, fare, duration, recommendation, or option number and select one.', parameters: { type: 'object', properties: { say: { type: 'string' }, strategy: { type: 'string', enum: ['best_fit','highest_comfort','lowest_fare','fastest'] }, option_index: { type: ['integer','null'], minimum: 1, maximum: 4 }, continue_to_payment: { type: 'boolean' } }, required: ['say','strategy','option_index','continue_to_payment'], additionalProperties: false }, strict: true },
  { type: 'function', name: 'payment_gateway', description: 'List, select, add, or pay with a RailSetu payment method. Every payment needs a fresh approval.', parameters: { type: 'object', properties: { say: { type: 'string' }, intent: { type: 'string', enum: ['list','select','add','pay'] }, method_type: { type: ['string','null'], enum: ['wallet','upi','card',null] }, mode: { type: ['string','null'], description: 'wallet, upi, visa, mastercard, or card-####' }, label: { type: ['string','null'] } }, required: ['say','intent','method_type','mode','label'], additionalProperties: false }, strict: true },
  { type: 'function', name: 'download_ticket', description: 'Download an issued ticket on the ticket page.', parameters: { type: 'object', properties: { say: { type: 'string' } }, required: ['say'], additionalProperties: false }, strict: true },
  { type: 'function', name: 'navigate', description: 'Navigate only to a safe RailSetu page.', parameters: { type: 'object', properties: { say: { type: 'string' }, path: { type: 'string', enum: ['/','/about','/planner'] } }, required: ['say','path'], additionalProperties: false }, strict: true },
  { type: 'function', name: 'ask_user', description: 'Ask exactly one concise question when a required detail is missing or ambiguous.', parameters: { type: 'object', properties: { say: { type: 'string' }, missing_field: { type: ['string','null'] } }, required: ['say','missing_field'], additionalProperties: false }, strict: true },
] as const;

type ConversationMessage = { role: 'user' | 'assistant'; text: string };

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const limited = enforceRateLimit(request, 'jamvanta-turn', 30);
    if (limited) return limited;
    const value = await readJsonBody(request, MAX_BODY_BYTES);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiRequestError(400, 'Invalid Jamvanta request.');
    const body = value as { transcript?: string; pathname?: string; spokenLanguage?: string; history?: ConversationMessage[]; memory?: unknown };
    const transcript = plainText(body.transcript).trim();
    const requestedPath = String(body.pathname ?? '/').split('?')[0];
    const pathname = allowedPaths.has(requestedPath) ? requestedPath : '/';
    if (!transcript) return secureJson({ error: 'Transcript is required.' }, { status: 400 });
    const spokenLanguage = plainText(body.spokenLanguage, 12);
    const memory = enrichMemory(cleanMemory(body.memory, pathname), transcript);
    const fallback = localTurn(transcript, pathname, spokenLanguage, memory);
    if (!process.env.OPENAI_API_KEY) return secureJson({ ...fallback, mode: 'local-simulation' });
    const history = Array.isArray(body.history) ? body.history.filter((message) => message && (message.role === 'user' || message.role === 'assistant') && typeof message.text === 'string').slice(-24).map((message) => `${message.role}: ${plainText(message.text, 500)}`).join('\n') : '';
    try {
      const controller = new AbortController();
      // Keep the hands-free flow moving if the model provider is temporarily slow.
      // The deterministic tool planner below remains capable of completing the turn.
      const timeout = setTimeout(() => controller.abort(), 6_500);
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', signal: controller.signal,
        headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL ?? 'gpt-5-mini',
          instructions: `You are Jamvanta, RailSetu's hands-free railway booking agent. Today in India is ${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })}. Use exactly one provided tool every turn. Structured memory is authoritative: never ask again for any journey or comfort detail already present. Ask only one missing essential detail at a time. After the essentials, collect traveller type, luggage, coach movement, maximum seat changes and lower-berth preference in one concise preference question; the user may accept recommended defaults. Do not search until preferencesConfirmed is true. Then use journey_planner with auto_continue=true unless the user explicitly wants only results. Use select_journey for highest comfort, cheapest, fastest, best, or an option number. On payment, list saved UPI/cards when only a category is given; select/pay only when a specific saved mode is named. Every payment method and every transaction requires a new explicit approval: never claim success, bypass approval, infer approval from conversation, or reuse approval. Use concise natural English, Hindi, or Hinglish. Never routinely mention prototype limitations. Say railway classes as executive chair car, AC chair car, 3 tier AC, 2 tier AC, first class AC, or sleeper class. You may control only supplied tools.`,
          input: `Current page: ${pathname}\nPersistent session memory: ${JSON.stringify(memory)}\nRecent transcript:\n${history}\nuser: ${transcript}`,
          tools, tool_choice: 'required', parallel_tool_calls: false,
          reasoning: { effort: 'minimal' },
          text: { verbosity: 'low' },
          max_output_tokens: 350,
        }),
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`OpenAI returned ${response.status}: ${plainText(await response.text(), 500)}`);
      const result = await response.json() as { output?: Array<{ type?: string; name?: string; arguments?: string }> };
      const item = result.output?.find((output) => output.type === 'function_call' && typeof output.name === 'string');
      if (!item?.name || typeof item.arguments !== 'string') throw new Error('No agent tool was selected');
      const planned = toolToTurn({ name: item.name, arguments: JSON.parse(item.arguments) as Record<string, unknown> }, fallback, memory, pathname);
      // A concrete payment request is never left to a probabilistic intent label.
      // The deterministic parser may only produce allow-listed actions, and the
      // approval route will bind its fresh nonce to the exact server-side charge.
      const guarded = fallback.action?.type === 'plan_journey' || fallback.clarification
        ? fallback
        : pathname === '/payment' && fallback.requiresApproval
          ? fallback
          : planned;
      return secureJson({ ...guarded, mode: 'openai-agent' });
    } catch (providerError) {
      console.warn('[jamvanta-agent] provider tool selection failed', providerError instanceof Error ? providerError.message : 'unknown error');
      return secureJson({ ...fallback, mode: 'local-fallback' });
    }
  } catch (error) {
    return apiError(error, 'Jamvanta could not complete this turn.');
  }
}
