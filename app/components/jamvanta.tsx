'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import { dispatchJamvantaAction, JAMVANTA_FEEDBACK_EVENT, routeJamvantaAction, takePendingJamvantaAction, type JamvantaAction, type JamvantaTurn } from '../lib/jamvanta';
import { plainText } from '../lib/plain-text';
import { getWalletBalance } from '../lib/wallet';

type VoiceRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};
type VoiceRecognitionConstructor = new () => VoiceRecognition;
type Message = { id: string; role: 'user' | 'assistant'; text: string };
type PaymentChoice = { mode: string; label: string; detail: string };
type PaymentFlow = { methodType: 'upi' | 'card'; choices: PaymentChoice[]; awaiting: 'choice' | 'custom-upi' };
const JAMVANTA_SESSION_KEY = 'railsetu.jamvanta-session.v1';
const JAMVANTA_PAYMENT_FLOW_KEY = 'railsetu.jamvanta-payment-flow.v1';
const JAMVANTA_DOWNLOAD_AFTER_PAYMENT_KEY = 'railsetu.jamvanta-download-after-payment.v1';
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
let activeProviderAudio: HTMLAudioElement | null = null;
let activeSpeechFinish: (() => void) | null = null;

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
    try {
      const response = await fetch('/api/jamvanta/speak', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, language }) });
      if (!response.ok) throw new Error('Sarvam speech unavailable');
      const result = await response.json() as { audio?: string; contentType?: string };
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
      return;
    } catch {
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
  const messagesRef = useRef<Message[]>([]);
  const recognition = useRef<VoiceRecognition | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const latestDraft = useRef('');
  const wantsListening = useRef(false);
  const recognitionRestartTimer = useRef<number | null>(null);
  const silenceTimer = useRef<number | null>(null);
  const beginListeningRef = useRef<() => Promise<void>>(async () => undefined);
  const sending = useRef(false);
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
    } catch {
      // A fresh in-memory conversation still works if session storage is unavailable.
    }
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
      stopJamvantaSpeech();
    };
  }, [listening, open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [open]);

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
    routeJamvantaAction(action);
  }, []);

  useEffect(() => {
    const handleFeedback = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; action?: JamvantaAction }>).detail;
      const message = plainText(detail?.message ?? '').trim();
      if (!message) return;
      suggestedAction.current = detail.action ?? null;
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
  }, [providers.sarvam, updateMessages]);

  const choosePayment = useCallback((choice: PaymentChoice) => {
    paymentFlow.current = null;
    try { window.sessionStorage.removeItem(JAMVANTA_PAYMENT_FLOW_KEY); } catch { /* In-memory flow is already cleared. */ }
    setPaymentChoices([]);
    setPending({
      action: { type: 'pay_with_method', mode: choice.mode, label: `${choice.label} ${choice.detail}`, approvalId: crypto.randomUUID() },
      label: `Approve ${choice.label} payment`,
    });
  }, []);

  const clearConversation = useCallback(() => {
    stopJamvantaSpeech();
    speechSequence.current += 1;
    suggestedAction.current = null;
    paymentFlow.current = null;
    messagesRef.current = [];
    latestDraft.current = '';
    setMessages([]);
    setDraft('');
    setPending(null);
    setPaymentChoices([]);
    try {
      window.sessionStorage.removeItem(JAMVANTA_SESSION_KEY);
      window.sessionStorage.removeItem(JAMVANTA_PAYMENT_FLOW_KEY);
    } catch { /* The in-memory session is still cleared. */ }
  }, []);

  const send = useCallback(async (text: string, spokenLanguage?: string) => {
    const transcript = plainText(text).trim();
    if (!transcript || sending.current) return;
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
    if (suggestion && /^(yes|yeah|yep|sure|ok(?:ay)?|continue|go ahead|do it|please do|haan|ha|हाँ|हां|ठीक है)[.! ]*$/i.test(transcript)) {
      suggestedAction.current = null;
      setDraft('');
      updateMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: 'user', text: transcript },
        { id: crypto.randomUUID(), role: 'assistant', text: 'Okay, I’ll continue with that option.' },
      ]);
      execute(suggestion);
      return;
    }
    if (suggestion && /^(no|nope|cancel|not now|nahi|nahin|नहीं|नही)[.! ]*$/i.test(transcript)) {
      suggestedAction.current = null;
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
    suggestedAction.current = null;
    sending.current = true;
    setDraft('');
    setWorking(true);
    setPending(null);
    setPaymentChoices([]);
    const history = messagesRef.current.slice(-12).map(({ role, text: messageText }) => ({ role, text: messageText }));
    updateMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: transcript }]);
    let listenAfterReply = false;
    try {
      const response = await fetch('/api/jamvanta/turn', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transcript, spokenLanguage, pathname: window.location.pathname, search: window.location.search, history }),
      });
      const turn = await response.json() as JamvantaTurn & { mode?: string; error?: string };
      if (!response.ok) throw new Error(turn.error ?? 'Jamvanta could not understand that.');
      setNotice(turn.mode === 'openai' ? 'Sarvam + OpenAI connected' : turn.mode === 'local-fallback' ? 'Provider fallback · safe local actions' : 'Local simulation · no API credits used');
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
      const message = error instanceof Error ? error.message : 'Jamvanta is temporarily unavailable.';
      updateMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: message }]);
    } finally {
      sending.current = false;
      setWorking(false);
      if (listenAfterReply) {
        window.setTimeout(() => {
          if (panel.current) void beginListeningRef.current();
        }, 180);
      }
    }
  }, [choosePayment, execute, providers.sarvam, updateMessages]);

  const stopListening = useCallback(() => {
    wantsListening.current = false;
    if (silenceTimer.current !== null) window.clearTimeout(silenceTimer.current);
    silenceTimer.current = null;
    if (recognitionRestartTimer.current !== null) window.clearTimeout(recognitionRestartTimer.current);
    recognitionRestartTimer.current = null;
    const activeRecognition = recognition.current;
    recognition.current = null;
    try { activeRecognition?.stop(); } catch { /* Recognition may already have ended between events. */ }
    const providerRecordingActive = recorder.current?.state === 'recording';
    if (providerRecordingActive) recorder.current?.stop();
    else if (latestDraft.current.trim()) void send(latestDraft.current);
    setListening(false);
    setNotice('Processing what you said…');
  }, [send]);

  const beginListening = useCallback(async () => {
    setOpen(true);
    stopJamvantaSpeech();
    latestDraft.current = '';
    setDraft('');
    wantsListening.current = true;
    const recognitionConstructor = (window.SpeechRecognition ?? window.webkitSpeechRecognition) as unknown as VoiceRecognitionConstructor | undefined;
    if (!recognitionConstructor) {
      setNotice('Voice recognition is unavailable here · type below instead');
      requestAnimationFrame(() => panel.current?.querySelector<HTMLInputElement>('input')?.focus());
      return;
    }
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if ('MediaRecorder' in window) {
          audioChunks.current = [];
          const mediaRecorder = new MediaRecorder(stream);
          recorder.current = mediaRecorder;
          mediaRecorder.ondataavailable = (event) => { if (event.data.size) audioChunks.current.push(event.data); };
          mediaRecorder.onstop = async () => {
            recorder.current = null;
            stream.getTracks().forEach((track) => track.stop());
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
      const instance = new recognitionConstructor();
      recognition.current = instance;
      instance.continuous = true;
      instance.interimResults = true;
      instance.lang = 'en-IN';
      instance.onresult = (event) => {
        let next = '';
        for (let index = 0; index < event.results.length; index += 1) next += event.results[index][0].transcript;
        latestDraft.current = next.trim();
        setDraft(plainText(next.trim()));
        if (silenceTimer.current !== null) window.clearTimeout(silenceTimer.current);
        silenceTimer.current = window.setTimeout(() => stopListening(), 4000);
      };
      instance.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          wantsListening.current = false;
          setNotice('Microphone permission is needed · type below instead');
          if (recorder.current?.state === 'recording') recorder.current.stop();
          setListening(false);
        }
      };
      instance.onend = () => {
        if (wantsListening.current && recognition.current === instance) {
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
      silenceTimer.current = window.setTimeout(() => stopListening(), 4000);
    } catch {
      wantsListening.current = false;
      setNotice('Microphone permission is needed · type below instead');
      setListening(false);
      if (recorder.current?.state === 'recording') recorder.current.stop();
    }
  }, [send, stopListening]);

  useEffect(() => {
    beginListeningRef.current = beginListening;
  }, [beginListening]);

  const approve = async () => {
    if (!pending || (pending.action.type !== 'pay_with_wallet' && pending.action.type !== 'pay_with_method')) return;
    setWorking(true);
    try {
      const amount = Number(new URLSearchParams(window.location.search).get('fare')) || 0;
      if (pending.action.type === 'pay_with_wallet' && getWalletBalance() < amount) throw new Error('Your RailSetu Wallet balance is too low for this fare. Add money or choose another payment method.');
      const operation = pending.action.type === 'pay_with_wallet' ? 'wallet-payment' : `payment-${pending.action.mode}`;
      const prepared = await fetch('/api/jamvanta/approval', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operation, amount }) }).then((response) => response.json()) as { token?: string };
      if (!prepared.token) throw new Error('Approval could not be prepared.');
      const verified = await fetch('/api/jamvanta/approval', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: prepared.token }) }).then((response) => response.json()) as { approved?: boolean };
      if (!verified.approved) throw new Error('Approval expired. Please try again.');
      window.sessionStorage.setItem(JAMVANTA_DOWNLOAD_AFTER_PAYMENT_KEY, '1');
      execute(pending.action);
      updateMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: 'Approved. Completing the payment now.' }]);
      setPending(null);
    } catch (error) {
      updateMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: error instanceof Error ? error.message : 'Approval failed.' }]);
    } finally {
      setWorking(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(draft);
  };

  const paymentAmount = money.format(Number(new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('fare')) || 0);

  return (
    <>
      <div className="jamvanta-edge" aria-hidden="true" />
      {open ? (
        <section className="jamvanta-panel" ref={panel} role="dialog" aria-label="Jamvanta voice assistant">
          <header>
            <div><small>RAILSETU VOICE</small><strong>Jamvanta</strong></div>
            <div className="jamvanta-header-actions"><button className="jamvanta-clear" type="button" onClick={clearConversation} disabled={working || listening || messages.length === 0} aria-label="Clear Jamvanta chat history and memory">Clear</button><button type="button" onClick={() => { stopListening(); setOpen(false); }} aria-label="Close Jamvanta">×</button></div>
          </header>
          <div className="jamvanta-status"><i className={listening ? 'is-live' : ''} />{notice}</div>
          <div className="jamvanta-conversation" ref={conversation} aria-live="polite">
            {messages.length === 0 ? (
              <div className="jamvanta-empty"><strong>Where should we go?</strong><p>Try “Find a train from New Delhi to Patna for two passengers.”</p><span>हिंदी, English और Hinglish</span></div>
            ) : messages.map((message) => <p className={`is-${message.role}`} key={message.id}>{message.text}</p>)}
            {working ? <p className="is-assistant is-working">Jamvanta is thinking…</p> : null}
            {paymentChoices.length ? <div className="jamvanta-payment-choices" aria-label="Saved payment methods">{paymentChoices.map((choice) => <button type="button" key={choice.mode} onClick={() => choosePayment(choice)}><strong>{choice.label}</strong><span>{choice.detail}</span></button>)}<button type="button" onClick={() => void send(paymentFlow.current?.methodType === 'card' ? 'Add another card' : 'Add my own UPI ID')}><strong>Add your own</strong><span>{paymentFlow.current?.methodType === 'card' ? 'New card' : 'New UPI ID'}</span></button></div> : null}
          </div>
          {pending ? <div className="jamvanta-approval"><div className="jamvanta-approval-summary"><div><small>PAYMENT APPROVAL</small><strong>{pending.action.type === 'pay_with_method' ? pending.action.label : 'RailSetu Wallet'}</strong></div><b>{paymentAmount}</b></div><div className="jamvanta-approval-actions"><button type="button" onClick={() => setPending(null)}>Cancel</button><button type="button" className="is-primary" aria-label={pending.label} onClick={() => void approve()}>Approve</button></div></div> : null}
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
