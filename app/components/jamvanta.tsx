'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { BorderBeam } from 'border-beam';
import { ThinkingOrb } from 'thinking-orbs';
import { TypingIndicator } from './assistant-ui/elements/typing-indicator';
import { dispatchJamvantaAction, JAMVANTA_FEEDBACK_EVENT, JAMVANTA_PAYMENT_CONTEXT_EVENT, routeJamvantaAction, takePendingJamvantaAction, type JamvantaAction, type JamvantaMemory, type JamvantaTurn } from '../lib/jamvanta';
import { plainText } from '../lib/plain-text';
import { getWalletBalance } from '../lib/wallet';

type VoiceRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal?: boolean }> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};
type VoiceRecognitionConstructor = new () => VoiceRecognition;
type Message = { id: string; role: 'user' | 'assistant'; text: string };
type PaymentChoice = { mode: string; label: string; detail: string };
type PaymentFlow = { methodType: 'upi' | 'card'; choices: PaymentChoice[]; awaiting: 'choice' | 'custom-upi' };
const JAMVANTA_SESSION_KEY = 'railsetu.jamvanta-session.v1';
const JAMVANTA_MEMORY_KEY = 'railsetu.jamvanta-memory.v2';
const JAMVANTA_PAYMENT_FLOW_KEY = 'railsetu.jamvanta-payment-flow.v1';
const JAMVANTA_DOWNLOAD_AFTER_PAYMENT_KEY = 'railsetu.jamvanta-download-after-payment.v1';
const JAMVANTA_SUGGESTED_ACTION_KEY = 'railsetu.jamvanta-suggested-action.v1';
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
let activeProviderAudio: HTMLAudioElement | null = null;
let activeSpeechFinish: (() => void) | null = null;
let activeSpeechRequest: AbortController | null = null;

const affirmativeSuggestion = (value: string) => {
  const normalized = value.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/\b(no|nope|not|don'?t|cancel|nahi|nahin)\b|नहीं|नही/.test(normalized)) return false;
  return /^(yes|yeah|yep|sure|ok(?:ay)?|continue|go ahead|do it|please do|haan|ha|हाँ|हां|ठीक है)\b/.test(normalized)
    || /\b(apply|accept|allow|use|take|choose|proceed with)\b.*\b(change|changes|recommendation|recommended|option)\b/.test(normalized)
    || /\b(any number|any amount|as many)\b.*\b(change|changes)\b/.test(normalized)
    || /\b(that|this)\b.*\b(works|is fine|sounds good|option)\b/.test(normalized);
};

const negativeSuggestion = (value: string) => /^(no|nope|cancel|not now|nahi|nahin|नहीं|नही)\b/i.test(value.trim());

function savedPaymentChoices(methodType: 'upi' | 'card') {
  const choices: PaymentChoice[] = methodType === 'upi'
    ? [{ mode: 'upi', label: 'RailSetu UPI', detail: 'railsetu@upi' }]
    : [
        { mode: 'visa', label: 'Visa', detail: 'Ending 6756' },
        { mode: 'mastercard', label: 'Mastercard', detail: 'Ending 4632' },
      ];
  if (methodType === 'card') {
    try {
      const saved = JSON.parse(window.localStorage.getItem('railsetu.mock-cards.v1') ?? '[]') as Array<{ id?: string; last4?: string; mark?: string }>;
      saved.forEach((card) => {
        if (card.id && /^\d{4}$/.test(card.last4 ?? '')) choices.push({ mode: card.id, label: plainText(card.mark ?? 'Card'), detail: `Ending ${card.last4}` });
      });
    } catch { /* Built-in card choices remain available. */ }
  }
  return choices;
}

function paymentChoicePrompt(methodType: 'upi' | 'card', choices: PaymentChoice[]) {
  if (methodType === 'upi') return `Your saved UPI option is ${choices[0].detail}. Would you like to use it or add your own UPI ID?`;
  const available = choices.map((choice) => `${choice.label} ${choice.detail.toLowerCase()}`).join(', ');
  return `Your saved cards are ${available}. Which one would you like to use, or would you like to add another card?`;
}

function stopJamvantaSpeech() {
  activeSpeechRequest?.abort();
  activeSpeechRequest = null;
  activeProviderAudio?.pause();
  activeProviderAudio = null;
  window.speechSynthesis?.cancel();
  activeSpeechFinish?.();
  activeSpeechFinish = null;
}

function browserSpeak(text: string, language: JamvantaTurn['language']) {
  if (!('speechSynthesis' in window)) return Promise.resolve();
  stopJamvantaSpeech();
  return new Promise<void>((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (activeSpeechFinish === finish) activeSpeechFinish = null;
      resolve();
    };
    activeSpeechFinish = finish;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.rate = language === 'hi-IN' ? 0.94 : 1;
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  });
}

async function speak(text: string, language: JamvantaTurn['language'], useSarvam: boolean) {
  stopJamvantaSpeech();
  if (useSarvam) {
    const controller = new AbortController();
    activeSpeechRequest = controller;
    try {
      const response = await fetch('/api/jamvanta/speak', { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, language }) });
      if (!response.ok) throw new Error('Sarvam speech unavailable');
      const result = await response.json() as { audio?: string; contentType?: string };
      if (controller.signal.aborted) return;
      if (!result.audio) throw new Error('Sarvam returned no audio');
      const audio = new Audio(`data:${result.contentType ?? 'audio/wav'};base64,${result.audio}`);
      activeProviderAudio = audio;
      await new Promise<void>((resolve, reject) => {
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          if (activeSpeechFinish === finish) activeSpeechFinish = null;
          resolve();
        };
        const fail = (error: unknown) => {
          if (finished) return;
          finished = true;
          if (activeSpeechFinish === finish) activeSpeechFinish = null;
          reject(error);
        };
        activeSpeechFinish = finish;
        audio.onended = () => {
          if (activeProviderAudio === audio) activeProviderAudio = null;
          finish();
        };
        audio.onerror = () => {
          if (activeProviderAudio === audio) activeProviderAudio = null;
          fail(new Error('Sarvam audio playback failed'));
        };
        void audio.play().catch(fail);
      });
      if (activeSpeechRequest === controller) activeSpeechRequest = null;
      return;
    } catch {
      if (activeSpeechRequest === controller) activeSpeechRequest = null;
      if (controller.signal.aborted) return;
      // The device voice is a resilient fallback when provider audio cannot play.
    }
  }
  await browserSpeak(text, language);
}

export default function Jamvanta() {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [working, setWorking] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<{ action: JamvantaAction; label: string } | null>(null);
  const [notice, setNotice] = useState('Local simulation · add provider keys when ready');
  const [dark, setDark] = useState(false);
  const [providers, setProviders] = useState({ sarvam: false, openai: false, approval: true });
  const [paymentChoices, setPaymentChoices] = useState<PaymentChoice[]>([]);
  const [paymentAmountValue, setPaymentAmountValue] = useState(0);
  const messagesRef = useRef<Message[]>([]);
  const recognition = useRef<VoiceRecognition | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const activeStream = useRef<MediaStream | null>(null);
  const discardRecording = useRef(false);
  const audioChunks = useRef<Blob[]>([]);
  const latestDraft = useRef('');
  const transcriptUiTimer = useRef<number | null>(null);
  const browserTranscriptSubmitted = useRef(false);
  const recognitionBaseTranscript = useRef('');
  const audioMonitorTimer = useRef<number | null>(null);
  const audioMonitorContext = useRef<AudioContext | null>(null);
  const heardVoice = useRef(false);
  const lastVoiceAt = useRef(0);
  const memoryRef = useRef<JamvantaMemory>({ journey: {}, payment: {}, stage: 'collecting', lastPath: '/' });
  const wantsListening = useRef(false);
  const recognitionRestartTimer = useRef<number | null>(null);
  const silenceTimer = useRef<number | null>(null);
  const beginListeningRef = useRef<() => Promise<void>>(async () => undefined);
  const sending = useRef(false);
  const turnRequest = useRef<AbortController | null>(null);
  const interactionSequence = useRef(0);
  const approving = useRef(false);
  const suggestedAction = useRef<JamvantaAction | null>(null);
  const paymentFlow = useRef<PaymentFlow | null>(null);
  const speechSequence = useRef(0);
  const panel = useRef<HTMLElement>(null);
  const conversation = useRef<HTMLDivElement>(null);

  const updateMessages = useCallback((updater: (current: Message[]) => Message[]) => {
    setMessages((current) => {
      const next = updater(current).slice(-20);
      messagesRef.current = next;
      try { window.sessionStorage.setItem(JAMVANTA_SESSION_KEY, JSON.stringify(next)); } catch { /* Keep the current tab's in-memory context. */ }
      return next;
    });
  }, []);

  useEffect(() => {
    if (window.location.pathname !== '/payment') return;
    try {
      const restored = JSON.parse(window.sessionStorage.getItem(JAMVANTA_PAYMENT_FLOW_KEY) ?? 'null') as PaymentFlow | null;
      if (!restored || (restored.methodType !== 'upi' && restored.methodType !== 'card') || !Array.isArray(restored.choices)) return;
      paymentFlow.current = restored;
      setPaymentChoices(restored.choices);
    } catch { /* A fresh payment conversation remains available. */ }
  }, []);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(JAMVANTA_SESSION_KEY) ?? '[]') as Message[];
      if (Array.isArray(stored)) {
        const restored = stored.filter((message) => message && (message.role === 'user' || message.role === 'assistant') && typeof message.text === 'string').slice(-20).map((message) => ({ ...message, text: plainText(message.text) }));
        messagesRef.current = restored;
        setMessages(restored);
      }
      const storedMemory = JSON.parse(window.sessionStorage.getItem(JAMVANTA_MEMORY_KEY) ?? 'null') as JamvantaMemory | null;
      if (storedMemory?.journey && storedMemory?.payment) memoryRef.current = storedMemory;
      const storedSuggestion = JSON.parse(window.sessionStorage.getItem(JAMVANTA_SUGGESTED_ACTION_KEY) ?? 'null') as JamvantaAction | null;
      if (storedSuggestion?.type === 'plan_journey') suggestedAction.current = storedSuggestion;
      memoryRef.current = {
        ...memoryRef.current,
        lastPath: window.location.pathname,
        stage: window.location.pathname === '/ticket' ? 'ticket' : window.location.pathname === '/payment' && memoryRef.current.stage !== 'approval' ? 'payment' : memoryRef.current.stage,
      };
      window.sessionStorage.setItem(JAMVANTA_MEMORY_KEY, JSON.stringify(memoryRef.current));
    } catch {
      // A fresh in-memory conversation still works if session storage is unavailable.
    }
  }, []);

  useEffect(() => {
    const handlePaymentContext = (event: Event) => {
      const detail = (event as CustomEvent<{ fare?: number }>).detail;
      const fare = Number(detail?.fare);
      if (Number.isFinite(fare) && fare >= 0) setPaymentAmountValue(fare);
    };
    window.addEventListener(JAMVANTA_PAYMENT_CONTEXT_EVENT, handlePaymentContext);
    const reservationId = new URLSearchParams(window.location.search).get('reservation');
    if (window.location.pathname === '/payment' && reservationId && /^res_[a-f0-9]{32}$/.test(reservationId)) {
      void fetch(`/api/reservations/${reservationId}`).then((response) => response.json()).then((data: { itinerary?: { fare?: number } }) => {
        const fare = Number(data.itinerary?.fare);
        if (Number.isFinite(fare) && fare >= 0) setPaymentAmountValue(fare);
      }).catch(() => undefined);
    }
    return () => window.removeEventListener(JAMVANTA_PAYMENT_CONTEXT_EVENT, handlePaymentContext);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (window.location.pathname === '/payment' && params.get('jamvanta') === '1') {
      params.delete('jamvanta');
      window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
      const message = 'I found the best complete route and brought you to payment. Would you like to use UPI, a saved card, or your RailSetu Wallet?';
      const timer = window.setTimeout(() => {
        setOpen(true);
        updateMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: message }]);
        void speak(message, 'en-IN', false).then(() => beginListeningRef.current());
      }, 350);
      return () => window.clearTimeout(timer);
    }
    if (window.location.pathname === '/ticket' && window.sessionStorage.getItem(JAMVANTA_DOWNLOAD_AFTER_PAYMENT_KEY) === '1') {
      window.sessionStorage.removeItem(JAMVANTA_DOWNLOAD_AFTER_PAYMENT_KEY);
      const timer = window.setTimeout(() => {
        setOpen(true);
        updateMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: 'Payment complete. Your ticket download is starting now.' }]);
        dispatchJamvantaAction({ type: 'download_ticket' });
      }, 1800);
      return () => window.clearTimeout(timer);
    }
  }, [updateMessages]);

  useEffect(() => {
    const pendingAction = takePendingJamvantaAction();
    if (!pendingAction) return;
    const timer = window.setTimeout(() => {
      setOpen(true);
      setNotice('Continuing your journey…');
      dispatchJamvantaAction(pendingAction);
    }, 250);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    void fetch('/api/jamvanta/status').then((response) => response.json()).then((status: { sarvam?: boolean; openai?: boolean; approval?: boolean }) => {
      const next = { sarvam: Boolean(status.sarvam), openai: Boolean(status.openai), approval: Boolean(status.approval) };
      setProviders(next);
      setNotice(next.sarvam && next.openai ? 'Sarvam + OpenAI connected' : 'Local simulation · add provider keys when ready');
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('railsetu-dark'));
    const observer = new MutationObserver(() => setDark(document.documentElement.classList.contains('railsetu-dark')));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('jamvanta-alive', open);
    document.documentElement.classList.toggle('jamvanta-listening', listening);
    return () => {
      document.documentElement.classList.remove('jamvanta-alive', 'jamvanta-listening');
      if (silenceTimer.current !== null) window.clearTimeout(silenceTimer.current);
      if (transcriptUiTimer.current !== null) window.clearTimeout(transcriptUiTimer.current);
      stopJamvantaSpeech();
    };
  }, [listening, open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      conversation.current?.scrollTo({ top: conversation.current.scrollHeight, behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, open, paymentChoices, pending, working]);

  const execute = useCallback((action: JamvantaAction) => {
    if (action.type === 'list_payment_methods') {
      const choices = savedPaymentChoices(action.methodType);
      const flow: PaymentFlow = { methodType: action.methodType, choices, awaiting: 'choice' };
      paymentFlow.current = flow;
      try { window.sessionStorage.setItem(JAMVANTA_PAYMENT_FLOW_KEY, JSON.stringify(flow)); } catch { /* In-memory flow still works. */ }
      setPaymentChoices(choices);
      return;
    }
    if (action.type === 'plan_journey') {
      memoryRef.current = {
        ...memoryRef.current,
        journey: {
          ...memoryRef.current.journey,
          ...(action.travelClass ? { travelClass: action.travelClass } : {}),
          ...(action.coachPreference ? { coachPreference: action.coachPreference } : {}),
          ...(typeof action.maxChanges === 'number' ? { maxChanges: action.maxChanges } : {}),
        },
        stage: action.search ? 'searching' : memoryRef.current.stage,
        lastPath: window.location.pathname,
      };
      try { window.sessionStorage.setItem(JAMVANTA_MEMORY_KEY, JSON.stringify(memoryRef.current)); } catch { /* In-memory context remains available. */ }
    }
    routeJamvantaAction(action);
  }, []);

  const rememberSuggestion = useCallback((action: JamvantaAction | null) => {
    suggestedAction.current = action;
    try {
      if (action) window.sessionStorage.setItem(JAMVANTA_SUGGESTED_ACTION_KEY, JSON.stringify(action));
      else window.sessionStorage.removeItem(JAMVANTA_SUGGESTED_ACTION_KEY);
    } catch { /* The in-memory suggestion remains available. */ }
  }, []);

  useEffect(() => {
    const handleFeedback = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; action?: JamvantaAction }>).detail;
      const message = plainText(detail?.message ?? '').trim();
      if (!message) return;
      rememberSuggestion(detail.action ?? null);
      const sequence = ++speechSequence.current;
      setOpen(true);
      setWorking(false);
      setNotice(detail.action ? 'Waiting for your choice…' : 'Tell me what you would like to change…');
      updateMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: message }]);
      void speak(message, 'en-IN', providers.sarvam).then(() => {
        if (speechSequence.current === sequence && panel.current) void beginListeningRef.current();
      });
    };
    window.addEventListener(JAMVANTA_FEEDBACK_EVENT, handleFeedback);
    return () => window.removeEventListener(JAMVANTA_FEEDBACK_EVENT, handleFeedback);
  }, [providers.sarvam, rememberSuggestion, updateMessages]);

  const choosePayment = useCallback((choice: PaymentChoice) => {
    paymentFlow.current = null;
    try { window.sessionStorage.removeItem(JAMVANTA_PAYMENT_FLOW_KEY); } catch { /* In-memory flow is already cleared. */ }
    setPaymentChoices([]);
    memoryRef.current = { ...memoryRef.current, payment: { methodType: choice.mode === 'wallet' ? 'wallet' : choice.mode.startsWith('upi') ? 'upi' : 'card', mode: choice.mode, label: `${choice.label} ${choice.detail}` }, stage: 'approval', lastPath: window.location.pathname };
    try { window.sessionStorage.setItem(JAMVANTA_MEMORY_KEY, JSON.stringify(memoryRef.current)); } catch { /* In-memory agent context remains available. */ }
    setPending({
      action: { type: 'pay_with_method', mode: choice.mode, label: `${choice.label} ${choice.detail}`, approvalId: crypto.randomUUID() },
      label: `Approve ${choice.label} payment`,
    });
  }, []);

  const clearConversation = useCallback(() => {
    stopJamvantaSpeech();
    speechSequence.current += 1;
    rememberSuggestion(null);
    paymentFlow.current = null;
    messagesRef.current = [];
    latestDraft.current = '';
    memoryRef.current = { journey: {}, payment: {}, stage: 'collecting', lastPath: window.location.pathname };
    setMessages([]);
    setDraft('');
    setPending(null);
    setPaymentChoices([]);
    try {
      window.sessionStorage.removeItem(JAMVANTA_SESSION_KEY);
      window.sessionStorage.removeItem(JAMVANTA_PAYMENT_FLOW_KEY);
      window.sessionStorage.removeItem(JAMVANTA_MEMORY_KEY);
      window.sessionStorage.removeItem(JAMVANTA_SUGGESTED_ACTION_KEY);
    } catch { /* The in-memory session is still cleared. */ }
  }, [rememberSuggestion]);

  const send = useCallback(async (text: string, spokenLanguage?: string) => {
    const transcript = plainText(text).trim();
    if (!transcript || sending.current) return;
    const turnSequence = interactionSequence.current;
    const activePaymentFlow = paymentFlow.current;
    if (activePaymentFlow) {
      const normalized = transcript.toLowerCase();
      const wantsAnother = /\b(add|new|another|my own|own)\b|नया|अपना/.test(normalized);
      if (wantsAnother && activePaymentFlow.methodType === 'card') {
        paymentFlow.current = null;
        try { window.sessionStorage.removeItem(JAMVANTA_PAYMENT_FLOW_KEY); } catch { /* In-memory flow is already cleared. */ }
        setPaymentChoices([]);
        const reply = 'I opened the secure card form. Add the card there, then tell me to use it.';
        updateMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: transcript }, { id: crypto.randomUUID(), role: 'assistant', text: reply }]);
        execute({ type: 'add_payment_method', methodType: 'card' });
        return;
      }
      if (wantsAnother && activePaymentFlow.methodType === 'upi') {
        const nextFlow: PaymentFlow = { ...activePaymentFlow, awaiting: 'custom-upi' };
        paymentFlow.current = nextFlow;
        try { window.sessionStorage.setItem(JAMVANTA_PAYMENT_FLOW_KEY, JSON.stringify(nextFlow)); } catch { /* In-memory flow still works. */ }
        setPaymentChoices([]);
        const reply = 'Tell me the UPI ID you want to use.';
        updateMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: transcript }, { id: crypto.randomUUID(), role: 'assistant', text: reply }]);
        const sequence = ++speechSequence.current;
        void speak(reply, 'en-IN', providers.sarvam).then(() => {
          if (speechSequence.current === sequence && panel.current) void beginListeningRef.current();
        });
        return;
      }
      if (activePaymentFlow.awaiting === 'custom-upi') {
        const spokenUpi = normalized.replace(/\s+at\s+/g, '@').replace(/\s+/g, '');
        const upiId = spokenUpi.match(/[a-z0-9._-]{2,}@[a-z0-9.-]{2,}/)?.[0];
        if (upiId) {
          updateMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: transcript }]);
          choosePayment({ mode: `upi-${upiId}`, label: 'UPI', detail: upiId });
          return;
        }
        const reply = 'I could not confirm that UPI ID. Please say it again, including the handle after “at”.';
        updateMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: transcript }, { id: crypto.randomUUID(), role: 'assistant', text: reply }]);
        const sequence = ++speechSequence.current;
        void speak(reply, 'en-IN', providers.sarvam).then(() => {
          if (speechSequence.current === sequence && panel.current) void beginListeningRef.current();
        });
        return;
      }
      const chosen = activePaymentFlow.choices.find((choice) => {
        const lastFour = choice.detail.match(/\d{4}/)?.[0];
        return (lastFour && normalized.includes(lastFour)) || normalized.includes(choice.label.toLowerCase()) || normalized.includes(choice.detail.toLowerCase());
      }) ?? (activePaymentFlow.choices.length === 1 && /\b(yes|use it|use this|saved|continue|okay|ok)\b|हाँ|हां/.test(normalized) ? activePaymentFlow.choices[0] : undefined);
      if (chosen) {
        updateMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: transcript }]);
        choosePayment(chosen);
        return;
      }
      const reply = paymentChoicePrompt(activePaymentFlow.methodType, activePaymentFlow.choices);
      updateMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: transcript }, { id: crypto.randomUUID(), role: 'assistant', text: reply }]);
      const sequence = ++speechSequence.current;
      void speak(reply, 'en-IN', providers.sarvam).then(() => {
        if (speechSequence.current === sequence && panel.current) void beginListeningRef.current();
      });
      return;
    }
    const suggestion = suggestedAction.current;
    if (suggestion && affirmativeSuggestion(transcript)) {
      rememberSuggestion(null);
      setDraft('');
      updateMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: 'user', text: transcript },
        { id: crypto.randomUUID(), role: 'assistant', text: 'Okay, I’ll continue with that option.' },
      ]);
      execute(suggestion);
      return;
    }
    if (suggestion && negativeSuggestion(transcript)) {
      rememberSuggestion(null);
      setDraft('');
      const reply = 'No problem. Tell me the date or travel class you would prefer instead.';
      updateMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: 'user', text: transcript },
        { id: crypto.randomUUID(), role: 'assistant', text: reply },
      ]);
      const sequence = ++speechSequence.current;
      void speak(reply, 'en-IN', providers.sarvam).then(() => {
        if (speechSequence.current === sequence && panel.current) void beginListeningRef.current();
      });
      return;
    }
    rememberSuggestion(null);
    sending.current = true;
    setDraft('');
    setWorking(true);
    setPending(null);
    setPaymentChoices([]);
    const history = messagesRef.current.slice(-24).map(({ role, text: messageText }) => ({ role, text: messageText }));
    updateMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: transcript }]);
    let listenAfterReply = false;
    try {
      const controller = new AbortController();
      turnRequest.current?.abort();
      turnRequest.current = controller;
      const response = await fetch('/api/jamvanta/turn', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transcript, spokenLanguage, pathname: window.location.pathname, search: window.location.search, history, memory: memoryRef.current }),
      });
      const turn = await response.json() as JamvantaTurn & { mode?: string; error?: string };
      if (interactionSequence.current !== turnSequence) return;
      if (!response.ok) throw new Error(turn.error ?? 'Jamvanta could not understand that.');
      if (turn.memory) {
        memoryRef.current = turn.memory;
        try { window.sessionStorage.setItem(JAMVANTA_MEMORY_KEY, JSON.stringify(turn.memory)); } catch { /* In-memory agent context remains authoritative. */ }
      }
      setNotice(turn.mode === 'openai-agent' ? 'Jamvanta agent · tools connected' : turn.mode === 'local-fallback' ? 'Provider fallback · safe local actions' : 'Local simulation · no API credits used');
      const safeReply = turn.action?.type === 'list_payment_methods'
        ? paymentChoicePrompt(turn.action.methodType, savedPaymentChoices(turn.action.methodType))
        : plainText(turn.reply);
      updateMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: safeReply }]);
      if (turn.action && turn.requiresApproval) setPending({ action: turn.action, label: turn.approvalLabel ?? 'Approve action' });
      else if (turn.action) execute(turn.action);
      listenAfterReply = !turn.requiresApproval;
      const sequence = ++speechSequence.current;
      await speak(safeReply, turn.language, providers.sarvam);
      if (speechSequence.current !== sequence) listenAfterReply = false;
    } catch (error) {
      if (interactionSequence.current !== turnSequence || (error instanceof DOMException && error.name === 'AbortError')) return;
      const message = error instanceof Error ? error.message : 'Jamvanta is temporarily unavailable.';
      updateMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: message }]);
    } finally {
      if (interactionSequence.current !== turnSequence) return;
      turnRequest.current = null;
      sending.current = false;
      setWorking(false);
      if (listenAfterReply) {
        window.setTimeout(() => {
          if (panel.current) void beginListeningRef.current();
        }, 180);
      }
    }
  }, [choosePayment, execute, providers.sarvam, rememberSuggestion, updateMessages]);

  const stopListening = useCallback(() => {
    wantsListening.current = false;
    if (silenceTimer.current !== null) window.clearTimeout(silenceTimer.current);
    silenceTimer.current = null;
    if (recognitionRestartTimer.current !== null) window.clearTimeout(recognitionRestartTimer.current);
    recognitionRestartTimer.current = null;
    if (audioMonitorTimer.current !== null) window.clearInterval(audioMonitorTimer.current);
    audioMonitorTimer.current = null;
    void audioMonitorContext.current?.close().catch(() => undefined);
    audioMonitorContext.current = null;
    const activeRecognition = recognition.current;
    recognition.current = null;
    try { activeRecognition?.stop(); } catch { /* Recognition may already have ended between events. */ }
    const browserDraft = latestDraft.current.trim();
    if (browserDraft) {
      browserTranscriptSubmitted.current = true;
      void send(browserDraft);
    }
    if (recorder.current?.state === 'recording') recorder.current.stop();
    setListening(false);
    setNotice('Processing what you said…');
  }, [send]);

  const beginListening = useCallback(async () => {
    const listeningSequence = interactionSequence.current;
    setOpen(true);
    stopJamvantaSpeech();
    latestDraft.current = '';
    browserTranscriptSubmitted.current = false;
    recognitionBaseTranscript.current = '';
    heardVoice.current = false;
    lastVoiceAt.current = Date.now();
    setDraft('');
    wantsListening.current = true;
    const recognitionConstructor = (window.SpeechRecognition ?? window.webkitSpeechRecognition) as unknown as VoiceRecognitionConstructor | undefined;
    try {
      // Native recognition supplies live interim text with far less client work.
      // Record audio for Sarvam only when native recognition is unavailable.
      if (!recognitionConstructor && navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (interactionSequence.current !== listeningSequence || !wantsListening.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        activeStream.current = stream;
        discardRecording.current = false;
        const AudioContextConstructor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioContextConstructor) {
          const context = new AudioContextConstructor();
          const analyser = context.createAnalyser();
          analyser.fftSize = 256;
          context.createMediaStreamSource(stream).connect(analyser);
          const samples = new Uint8Array(analyser.fftSize);
          audioMonitorContext.current = context;
          audioMonitorTimer.current = window.setInterval(() => {
            analyser.getByteTimeDomainData(samples);
            let energy = 0;
            for (const sample of samples) energy += Math.abs(sample - 128);
            if (energy / samples.length > 4.5) {
              heardVoice.current = true;
              lastVoiceAt.current = Date.now();
              if (silenceTimer.current !== null) window.clearTimeout(silenceTimer.current);
              silenceTimer.current = null;
            } else if (heardVoice.current && Date.now() - lastVoiceAt.current >= 4000) stopListening();
            else if (!heardVoice.current && Date.now() - lastVoiceAt.current >= 10_000) stopListening();
          }, 160);
        }
        if ('MediaRecorder' in window) {
          audioChunks.current = [];
          const mediaRecorder = new MediaRecorder(stream);
          recorder.current = mediaRecorder;
          mediaRecorder.ondataavailable = (event) => { if (event.data.size) audioChunks.current.push(event.data); };
          mediaRecorder.onstop = async () => {
            recorder.current = null;
            stream.getTracks().forEach((track) => track.stop());
            if (activeStream.current === stream) activeStream.current = null;
            if (discardRecording.current || interactionSequence.current !== listeningSequence || browserTranscriptSubmitted.current) return;
            const audio = new Blob(audioChunks.current, { type: mediaRecorder.mimeType || 'audio/webm' });
            try {
              const response = await fetch('/api/jamvanta/transcribe', {
                method: 'POST',
                headers: { 'content-type': audio.type || 'audio/webm' },
                body: audio,
              });
              if (!response.ok) throw new Error('fallback');
              const result = await response.json() as { transcript?: string; language?: string };
              if (result.transcript?.trim()) {
                setDraft(plainText(result.transcript));
                await send(result.transcript, result.language);
                return;
              }
            } catch {
              // Sarvam is optional locally; browser speech recognition supplies the transcript.
            }
            const fallbackDraft = latestDraft.current;
            if (fallbackDraft.trim()) await send(fallbackDraft);
          };
          mediaRecorder.start();
        } else stream.getTracks().forEach((track) => track.stop());
      }
      if (!recognitionConstructor) {
        if (recorder.current?.state === 'recording') {
          setListening(true);
          setNotice('Listening in English, Hindi or Hinglish…');
          if (audioMonitorTimer.current === null) silenceTimer.current = window.setTimeout(() => stopListening(), 12_000);
        } else {
          wantsListening.current = false;
          setNotice('Voice recognition is unavailable here · type below instead');
          requestAnimationFrame(() => panel.current?.querySelector<HTMLInputElement>('input')?.focus());
        }
        return;
      }
      const instance = new recognitionConstructor();
      recognition.current = instance;
      instance.continuous = true;
      instance.interimResults = true;
      instance.lang = 'en-IN';
      instance.onresult = (event) => {
        if (!wantsListening.current || recognition.current !== instance || interactionSequence.current !== listeningSequence) return;
        let next = '';
        for (let index = 0; index < event.results.length; index += 1) next += `${event.results[index][0].transcript} `;
        const batch = plainText(next.trim());
        const base = recognitionBaseTranscript.current;
        const normalized = base && batch.toLowerCase().startsWith(base.toLowerCase()) ? batch : plainText([base, batch].filter(Boolean).join(' '));
        latestDraft.current = normalized;
        if (transcriptUiTimer.current === null) {
          transcriptUiTimer.current = window.setTimeout(() => {
            transcriptUiTimer.current = null;
            setDraft(latestDraft.current);
          }, 48);
        }
        if (silenceTimer.current !== null) window.clearTimeout(silenceTimer.current);
        silenceTimer.current = window.setTimeout(() => stopListening(), 4000);
      };
      instance.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          recognition.current = null;
          if (recorder.current?.state === 'recording') setNotice('Listening securely through Sarvam…');
          else {
            wantsListening.current = false;
            setNotice('Microphone permission is needed · type below instead');
            setListening(false);
          }
        }
      };
      instance.onend = () => {
        if (wantsListening.current && recognition.current === instance) {
          recognitionBaseTranscript.current = latestDraft.current;
          recognitionRestartTimer.current = window.setTimeout(() => {
            if (!wantsListening.current || recognition.current !== instance) return;
            try { instance.start(); } catch { /* The next browser end event will retry while recording continues. */ }
          }, 180);
          return;
        }
        setListening(false);
      };
      instance.start();
      setListening(true);
      setNotice('Listening in English, Hindi or Hinglish…');
      silenceTimer.current = window.setTimeout(() => stopListening(), 10_000);
    } catch {
      wantsListening.current = false;
      if (audioMonitorTimer.current !== null) window.clearInterval(audioMonitorTimer.current);
      audioMonitorTimer.current = null;
      void audioMonitorContext.current?.close().catch(() => undefined);
      audioMonitorContext.current = null;
      setNotice('Microphone permission is needed · type below instead');
      setListening(false);
      if (recorder.current?.state === 'recording') recorder.current.stop();
    }
  }, [send, stopListening]);

  const hardStop = useCallback(() => {
    interactionSequence.current += 1;
    wantsListening.current = false;
    discardRecording.current = true;
    speechSequence.current += 1;
    sending.current = false;
    turnRequest.current?.abort();
    turnRequest.current = null;
    stopJamvantaSpeech();
    if (silenceTimer.current !== null) window.clearTimeout(silenceTimer.current);
    silenceTimer.current = null;
    if (recognitionRestartTimer.current !== null) window.clearTimeout(recognitionRestartTimer.current);
    recognitionRestartTimer.current = null;
    if (transcriptUiTimer.current !== null) window.clearTimeout(transcriptUiTimer.current);
    transcriptUiTimer.current = null;
    if (audioMonitorTimer.current !== null) window.clearInterval(audioMonitorTimer.current);
    audioMonitorTimer.current = null;
    const activeRecognition = recognition.current;
    recognition.current = null;
    if (activeRecognition) {
      activeRecognition.onresult = null;
      activeRecognition.onerror = null;
      activeRecognition.onend = null;
      try { activeRecognition.abort(); } catch { /* Recognition may already be closed. */ }
    }
    const activeRecorder = recorder.current;
    recorder.current = null;
    if (activeRecorder?.state === 'recording') {
      try { activeRecorder.stop(); } catch { /* Recorder may already be closing. */ }
    }
    activeStream.current?.getTracks().forEach((track) => track.stop());
    activeStream.current = null;
    void audioMonitorContext.current?.close().catch(() => undefined);
    audioMonitorContext.current = null;
    latestDraft.current = '';
    recognitionBaseTranscript.current = '';
    setDraft('');
    setListening(false);
    setWorking(false);
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hardStop();
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [hardStop, open]);

  useEffect(() => () => hardStop(), [hardStop]);

  useEffect(() => {
    beginListeningRef.current = beginListening;
  }, [beginListening]);

  const approve = async () => {
    if (approving.current || !pending || (pending.action.type !== 'pay_with_wallet' && pending.action.type !== 'pay_with_method')) return;
    approving.current = true;
    setWorking(true);
    try {
      const amount = paymentAmountValue;
      if (pending.action.type === 'pay_with_wallet' && amount > 0 && getWalletBalance() < amount) throw new Error('Your RailSetu Wallet balance is too low for this fare. Add money or choose another payment method.');
      const operation = pending.action.type === 'pay_with_wallet' ? 'wallet-payment' : `payment-${pending.action.mode}`;
      const reservationId = new URLSearchParams(window.location.search).get('reservation');
      const preparedResponse = await fetch('/api/jamvanta/approval', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operation, reservationId }) });
      const prepared = await preparedResponse.json() as { token?: string; error?: string | { message?: string } };
      if (!preparedResponse.ok) throw new Error(typeof prepared.error === 'string' ? prepared.error : prepared.error?.message ?? 'Approval could not be prepared.');
      if (!prepared.token) throw new Error('Approval could not be prepared.');
      window.sessionStorage.setItem(JAMVANTA_DOWNLOAD_AFTER_PAYMENT_KEY, '1');
      execute({ ...pending.action, approvalToken: prepared.token });
      updateMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: 'Approved. Completing the payment now.' }]);
      setPending(null);
    } catch (error) {
      updateMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: error instanceof Error ? error.message : 'Approval failed.' }]);
    } finally {
      approving.current = false;
      setWorking(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(draft);
  };

  const paymentAmount = money.format(paymentAmountValue);

  return (
    <>
      <div className={`jamvanta-edge-reveal ${listening ? 'is-listening' : ''}`} aria-hidden="true">
        <BorderBeam
          active={listening}
          borderRadius={18}
          brightness={2.35}
          className="jamvanta-edge"
          colorVariant="ocean"
          duration={2.65}
          hueRange={16}
          saturation={1.9}
          size="md"
          strength={1}
          theme={dark ? 'dark' : 'light'}
        >
          <div className="jamvanta-edge-surface" />
        </BorderBeam>
      </div>
      {open ? (
        <section className="jamvanta-panel" ref={panel} role="dialog" aria-label="Jamvanta voice assistant">
          <header>
            <div><small>RAILSETU VOICE</small><strong>Jamvanta</strong></div>
            <div className="jamvanta-header-actions"><button className="jamvanta-clear" type="button" onClick={clearConversation} disabled={working || listening || messages.length === 0} aria-label="Clear Jamvanta chat history and memory">Clear</button><button type="button" onClick={hardStop} aria-label="Close Jamvanta and stop listening">×</button></div>
          </header>
          <div className="jamvanta-status"><i className={listening ? 'is-live' : ''} />{notice}</div>
          <div className="jamvanta-conversation" ref={conversation} aria-live="polite">
            {messages.length === 0 ? (
              <div className="jamvanta-empty"><strong>Where should we go?</strong><p>Try “Find a train from New Delhi to Patna for two passengers.”</p><span>हिंदी, English और Hinglish</span></div>
            ) : messages.map((message) => <p className={`is-${message.role}`} key={message.id}>{message.text}</p>)}
            {working ? <TypingIndicator variant="bare" className="jamvanta-typing" /> : null}
            {paymentChoices.length ? <div className="jamvanta-payment-choices" aria-label="Saved payment methods">{paymentChoices.map((choice) => <button type="button" key={choice.mode} onClick={() => choosePayment(choice)}><strong>{choice.label}</strong><span>{choice.detail}</span></button>)}<button type="button" onClick={() => void send(paymentFlow.current?.methodType === 'card' ? 'Add another card' : 'Add my own UPI ID')}><strong>Add your own</strong><span>{paymentFlow.current?.methodType === 'card' ? 'New card' : 'New UPI ID'}</span></button></div> : null}
          </div>
          {pending ? <div className="jamvanta-approval"><div className="jamvanta-approval-summary"><div><small>PAYMENT APPROVAL</small><strong>{pending.action.type === 'pay_with_method' ? pending.action.label : 'RailSetu Wallet'}</strong></div><b>{paymentAmount}</b></div><div className="jamvanta-approval-actions"><button type="button" onClick={() => setPending(null)} disabled={working}>Cancel</button><button type="button" className="is-primary" aria-label={pending.label} onClick={() => void approve()} disabled={working}>Approve</button></div></div> : null}
          <form onSubmit={submit}>
            <input value={draft} onChange={(event) => setDraft(plainText(event.target.value))} maxLength={800} placeholder="Tell Jamvanta what to do…" aria-label="Message Jamvanta" />
            <button type="submit" disabled={!draft.trim() || working} aria-label="Send to Jamvanta">↑</button>
          </form>
          <footer>Session-only transcript · no raw audio is stored</footer>
        </section>
      ) : null}
      <button className={`jamvanta-orb ${listening ? 'is-listening' : ''}`} type="button" onClick={() => listening ? stopListening() : void beginListening()} aria-label={listening ? 'Stop listening' : 'Press to speak to Jamvanta'} aria-pressed={listening}>
        <ThinkingOrb state={listening ? 'listening' : working ? 'solving' : 'connecting'} size={64} theme={dark ? 'dark' : 'light'} />
        <span>{listening ? 'Listening…' : 'Press to speak'}</span>
      </button>
    </>
  );
}
