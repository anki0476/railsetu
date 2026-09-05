'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import { dispatchJamvantaAction, routeJamvantaAction, takePendingJamvantaAction, type JamvantaAction, type JamvantaTurn } from '../lib/jamvanta';
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
const JAMVANTA_SESSION_KEY = 'railsetu.jamvanta-session.v1';
const JAMVANTA_DOWNLOAD_AFTER_PAYMENT_KEY = 'railsetu.jamvanta-download-after-payment.v1';
let activeProviderAudio: HTMLAudioElement | null = null;

function stopJamvantaSpeech() {
  activeProviderAudio?.pause();
  activeProviderAudio = null;
  window.speechSynthesis?.cancel();
}

function browserSpeak(text: string, language: JamvantaTurn['language']) {
  if (!('speechSynthesis' in window)) return Promise.resolve();
  stopJamvantaSpeech();
  return new Promise<void>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.rate = language === 'hi-IN' ? 0.94 : 1;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
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
        audio.onended = () => {
          if (activeProviderAudio === audio) activeProviderAudio = null;
          resolve();
        };
        audio.onerror = () => {
          if (activeProviderAudio === audio) activeProviderAudio = null;
          reject(new Error('Sarvam audio playback failed'));
        };
        void audio.play().catch(reject);
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
  const [currentPath, setCurrentPath] = useState('');
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
  const panel = useRef<HTMLElement>(null);

  const updateMessages = useCallback((updater: (current: Message[]) => Message[]) => {
    setMessages((current) => {
      const next = updater(current).slice(-20);
      messagesRef.current = next;
      try { window.sessionStorage.setItem(JAMVANTA_SESSION_KEY, JSON.stringify(next)); } catch { /* Keep the current tab's in-memory context. */ }
      return next;
    });
  }, []);

  useEffect(() => {
    setCurrentPath(window.location.pathname);
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

  const execute = useCallback((action: JamvantaAction) => {
    if (action.type === 'list_payment_methods') {
      const choices: PaymentChoice[] = action.methodType === 'upi'
        ? [{ mode: 'upi', label: 'RailSetu UPI', detail: 'railsetu@upi' }]
        : [
            { mode: 'visa', label: 'Visa', detail: 'Ending 6756' },
            { mode: 'mastercard', label: 'Mastercard', detail: 'Ending 4632' },
          ];
      if (action.methodType === 'card') {
        try {
          const saved = JSON.parse(window.localStorage.getItem('railsetu.mock-cards.v1') ?? '[]') as Array<{ id?: string; last4?: string; mark?: string }>;
          saved.forEach((card) => {
            if (card.id && /^\d{4}$/.test(card.last4 ?? '')) choices.push({ mode: card.id, label: plainText(card.mark ?? 'Card'), detail: `Ending ${card.last4}` });
          });
        } catch { /* Built-in card choices remain available. */ }
      }
      setPaymentChoices(choices);
      return;
    }
    routeJamvantaAction(action);
  }, []);

  const choosePayment = useCallback((choice: PaymentChoice) => {
    setPaymentChoices([]);
    setPending({
      action: { type: 'pay_with_method', mode: choice.mode, label: `${choice.label} ${choice.detail}`, approvalId: crypto.randomUUID() },
      label: `Approve ${choice.label} payment`,
    });
  }, []);

  const send = useCallback(async (text: string, spokenLanguage?: string) => {
    const transcript = plainText(text).trim();
    if (!transcript || sending.current) return;
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
      const safeReply = plainText(turn.reply);
      updateMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: safeReply }]);
      await speak(safeReply, turn.language, providers.sarvam);
      listenAfterReply = !turn.requiresApproval;
      if (turn.action && turn.requiresApproval) setPending({ action: turn.action, label: turn.approvalLabel ?? 'Approve action' });
      else if (turn.action) execute(turn.action);
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
  }, [execute, providers.sarvam, updateMessages]);

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
              const form = new FormData();
              form.append('audio', audio, 'jamvanta.webm');
              const response = await fetch('/api/jamvanta/transcribe', { method: 'POST', body: form });
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

  if (!currentPath || currentPath === '/') return null;

  return (
    <>
      <div className="jamvanta-edge" aria-hidden="true" />
      {open ? (
        <section className="jamvanta-panel" ref={panel} role="dialog" aria-label="Jamvanta voice assistant">
          <header>
            <div><small>RAILSETU VOICE</small><strong>Jamvanta</strong></div>
            <button type="button" onClick={() => { stopListening(); setOpen(false); }} aria-label="Close Jamvanta">×</button>
          </header>
          <div className="jamvanta-status"><i className={listening ? 'is-live' : ''} />{notice}</div>
          <div className="jamvanta-conversation" aria-live="polite">
            {messages.length === 0 ? (
              <div className="jamvanta-empty"><strong>Where should we go?</strong><p>Try “Find a train from New Delhi to Patna for two passengers.”</p><span>हिंदी, English और Hinglish</span></div>
            ) : messages.map((message) => <p className={`is-${message.role}`} key={message.id}>{message.text}</p>)}
            {working ? <p className="is-assistant is-working">Jamvanta is thinking…</p> : null}
            {paymentChoices.length ? <div className="jamvanta-payment-choices" aria-label="Saved payment methods">{paymentChoices.map((choice) => <button type="button" key={choice.mode} onClick={() => choosePayment(choice)}><strong>{choice.label}</strong><span>{choice.detail}</span></button>)}</div> : null}
          </div>
          {pending ? <div className="jamvanta-approval"><div><small>CONFIRM BEFORE ACTION</small><strong>Complete this payment?</strong><span>{pending.action.type === 'pay_with_method' ? pending.action.label : 'RailSetu Wallet'} · The exact fare shown will be debited.</span></div><div><button type="button" onClick={() => setPending(null)}>Not now</button><button type="button" className="is-primary" onClick={() => void approve()}>{pending.label}</button></div></div> : null}
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
