import { NextResponse } from 'next/server';
import type { JamvantaAction, JamvantaTurn } from '../../../lib/jamvanta';
import { plainText } from '../../../lib/plain-text';

const stations: Array<[string, string[]]> = [
  ['NDLS', ['new delhi', 'delhi', 'नई दिल्ली', 'दिल्ली']],
  ['PNBE', ['patna junction', 'patna', 'पटना']],
  ['CNB', ['kanpur', 'कानपुर']],
  ['DURG', ['durg', 'दुर्ग']],
  ['BRC', ['vadodara', 'baroda', 'वडोदरा', 'बड़ौदा']],
];

function findStation(text: string, after: string[]) {
  const lower = text.toLowerCase();
  for (const marker of after) {
    const index = lower.indexOf(marker);
    if (index < 0) continue;
    const fragment = lower.slice(index + marker.length);
    const match = stations.find(([, names]) => names.some((name) => fragment.includes(name)));
    if (match) return match[0];
  }
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
  let action: JamvantaAction | undefined;
  let reply = hindi ? 'मैं आपकी रेलसेतु यात्रा में मदद कर सकता हूँ।' : 'I can help with your RailSetu journey.';

  if (/download|save ticket|टिकट.*डाउनलोड|डाउनलोड.*टिकट/.test(lower)) {
    action = { type: 'download_ticket' };
    reply = hindi ? 'टिकट डाउनलोड शुरू कर रहा हूँ।' : 'Starting the ticket download.';
  } else if (/pay.*wallet|wallet.*pay|वॉलेट.*भुगतान|भुगतान.*वॉलेट/.test(lower)) {
    action = { type: 'pay_with_wallet', approvalId: crypto.randomUUID() };
    reply = hindi ? 'रेलसेतु वॉलेट से भुगतान करने से पहले आपकी मंज़ूरी चाहिए।' : 'I need your approval before paying from the RailSetu Wallet.';
    return { reply, language, action, requiresApproval: true, approvalLabel: 'Approve wallet payment' };
  } else if (/continue|payment|भुगतान|आगे/.test(lower) && pathname.includes('planner')) {
    action = { type: 'continue_to_payment' };
    reply = hindi ? 'चुनी हुई यात्रा को भुगतान पेज पर ले जा रहा हूँ।' : 'Taking the selected journey to payment.';
  } else if (/home|मुख्य पृष्ठ/.test(lower)) {
    action = { type: 'navigate', path: '/' };
    reply = hindi ? 'मुख्य पृष्ठ खोल रहा हूँ।' : 'Opening the home page.';
  } else if (/about|रेलसेतु के बारे/.test(lower)) {
    action = { type: 'navigate', path: '/about' };
    reply = hindi ? 'रेलसेतु के बारे में पेज खोल रहा हूँ।' : 'Opening About RailSetu.';
  } else if (/plan|find|search|journey|train|यात्रा|ट्रेन|ढूँढ|खोज/.test(lower)) {
    const from = findStation(text, ['from ', 'से ', 'leaving ']);
    const to = findStation(text, ['to ', 'तक ', 'for ']);
    const allMatches = stations.filter(([, names]) => names.some((name) => lower.includes(name))).map(([code]) => code);
    action = {
      type: 'plan_journey',
      from: from ?? allMatches[0],
      to: to ?? allMatches.find((code) => code !== (from ?? allMatches[0])),
      passengerCount: passengerCount(text),
      date: spokenDate(text),
      travelClass: (text.match(/\b(1A|2A|3A|3E|CC|EC|SL)\b/i)?.[1] ?? undefined)?.toUpperCase(),
      search: /find|search|ढूँढ|खोज/.test(lower),
    };
    reply = hindi ? 'मैंने यात्रा की जानकारी तैयार कर दी है। खोजने से पहले विवरण जाँच लें।' : 'I have prepared the journey details. Please check them before searching.';
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
  const body = await request.json() as { transcript?: string; pathname?: string; spokenLanguage?: string; history?: ConversationMessage[] };
  const transcript = plainText(body.transcript);
  const pathname = String(body.pathname ?? '/');
  if (!transcript.trim()) return NextResponse.json({ error: 'Transcript is required.' }, { status: 400 });

  const spokenLanguage = String(body.spokenLanguage ?? '');
  const history = Array.isArray(body.history)
    ? body.history.filter((message) => message && (message.role === 'user' || message.role === 'assistant') && typeof message.text === 'string').slice(-12).map((message) => ({ role: message.role, text: plainText(message.text) }))
    : [];
  const context = conversationContext(history, transcript);
  const currentTurn = localTurn(transcript, pathname, spokenLanguage);
  const rememberedTurn = localTurn(context, pathname, spokenLanguage);
  const hasRememberedJourney = rememberedTurn.action?.type === 'plan_journey';
  const suppliesJourneyDetail = Boolean(spokenDate(transcript) || passengerCount(transcript) || /\b(1A|2A|3A|3E|CC|EC|SL)\b/i.test(transcript));
  const fallback = (!currentTurn.action && hasRememberedJourney && suppliesJourneyDetail)
    ? { ...rememberedTurn, language: currentTurn.language }
    : currentTurn.action?.type === 'plan_journey' && hasRememberedJourney
      ? { ...currentTurn, action: mergeJourneyAction(rememberedTurn.action as Extract<JamvantaAction, { type: 'plan_journey' }>, currentTurn.action) }
      : currentTurn;
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ ...fallback, mode: 'local-simulation' });
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? 'gpt-5-mini',
        instructions: 'You are Jamvanta, RailSetu voice navigation. Mirror the user language (en-IN or hi-IN). Concisely explain the next action and never claim a prototype booking is real. If the user supplied a date, acknowledge it instead of asking again. When mentioning railway classes, say 3 tier AC, 2 tier AC, 1st class AC, AC chair car, executive chair car, or sleeper class; never pronounce 3A/2A/1A as amperes. Return only JSON matching the schema. The server separately chooses the permitted action.',
        input: `Page: ${pathname}\nOriginal spoken language: ${spokenLanguage || 'infer from text'}\nConversation in this browser session:\n${history.map((message) => `${message.role}: ${message.text}`).join('\n')}\nuser: ${transcript}\nReply only to the final user message while retaining all journey details already supplied in this session. Do not ask again for a station, date, class, or passenger count already present above.`,
        text: { format: { type: 'json_schema', name: 'jamvanta_turn', strict: true, schema: {
          type: 'object', additionalProperties: false,
          properties: {
            reply: { type: 'string' }, language: { type: 'string', enum: ['en-IN', 'hi-IN'] },
          }, required: ['reply', 'language'],
        } } },
      }),
    });
    if (!response.ok) throw new Error('provider request failed');
    const result = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    const raw = result.output_text ?? result.output?.flatMap((item) => item.content ?? []).find((item) => item.text)?.text;
    if (!raw) throw new Error('provider returned no result');
    const providerTurn = JSON.parse(raw) as Pick<JamvantaTurn, 'reply' | 'language'>;
    providerTurn.reply = plainText(providerTurn.reply);
    return NextResponse.json({ ...fallback, ...providerTurn, mode: 'openai' });
  } catch {
    return NextResponse.json({ ...fallback, mode: 'local-fallback' });
  }
}
