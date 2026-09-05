'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import { dispatchJamvantaAction, type JamvantaAction, type JamvantaTurn } from '../lib/jamvanta';

type VoiceRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
type VoiceRecognitionConstructor = new () => VoiceRecognition;
type Message = { id: string; role: 'user' | 'assistant'; text: string };
const JAMVANTA_SESSION_KEY = 'railsetu.jamvanta-session.v1';
let activeProviderAudio: HTMLAudioElement | null = null;

function stopJamvantaSpeech() {
  activeProviderAudio?.pause();
  activeProviderAudio = null;
  window.speechSynthesis?.cancel();
}

function browserSpeak(text: string, language: JamvantaTurn['language']) {
  if (!('speechSynthesis' in window)) return;
  stopJamvantaSpeech();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language;
  utterance.rate = language === 'hi-IN' ? 0.94 : 1;
  window.speechSynthesis.speak(utterance);
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
      audio.onended = () => { if (activeProviderAudio === audio) activeProviderAudio = null; };
      await audio.play();
      return;
    } catch {
      // The device voice is a resilient fallback when provider audio cannot play.
    }
  }
  browserSpeak(text, language);
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
  const messagesRef = useRef<Message[]>([]);
  const recognition = useRef<VoiceRecognition | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const latestDraft = useRef('');
  const recorderWillSubmit = useRef(false);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(JAMVANTA_SESSION_KEY) ?? '[]') as Message[];
      if (Array.isArray(stored)) {
        const restored = stored.filter((message) => message && (message.role === 'user' || message.role === 'assistant') && typeof message.text === 'string').slice(-20);
        messagesRef.current = restored;
        setMessages(restored);
      }
    } catch {
      // A fresh in-memory conversation still works if session storage is unavailable.
    }
  }, []);

  const updateMessages = useCallback((updater: (current: Message[]) => Message[]) => {
    setMessages((current) => {
      const next = updater(current).slice(-20);
      messagesRef.current = next;
      try { window.sessionStorage.setItem(JAMVANTA_SESSION_KEY, JSON.stringify(next)); } catch { /* Keep the current tab's in-memory context. */ }
      return next;
    });
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
    if (action.type === 'navigate') window.location.assign(action.path);
    else dispatchJamvantaAction(action);
  }, []);

  const send = useCallback(async (text: string, spokenLanguage?: string) => {
    const transcript = text.trim();
    if (!transcript || working) return;
    setDraft('');
    setWorking(true);
    setPending(null);
    const history = messagesRef.current.slice(-12).map(({ role, text: messageText }) => ({ role, text: messageText }));
    updateMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: transcript }]);
    try {
      const response = await fetch('/api/jamvanta/turn', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transcript, spokenLanguage, pathname: window.location.pathname, search: window.location.search, history }),
      });
      const turn = await response.json() as JamvantaTurn & { mode?: string; error?: string };
      if (!response.ok) throw new Error(turn.error ?? 'Jamvanta could not understand that.');
      setNotice(turn.mode === 'openai' ? 'Sarvam + OpenAI connected' : turn.mode === 'local-fallback' ? 'Provider fallback · safe local actions' : 'Local simulation · no API credits used');
      updateMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: turn.reply }]);
      void speak(turn.reply, turn.language, providers.sarvam);
      if (turn.action && turn.requiresApproval) setPending({ action: turn.action, label: turn.approvalLabel ?? 'Approve action' });
      else if (turn.action) execute(turn.action);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Jamvanta is temporarily unavailable.';
      updateMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: message }]);
    } finally {
      setWorking(false);
    }
  }, [execute, providers.sarvam, updateMessages, working]);

  const stopListening = useCallback(() => {
    recognition.current?.stop();
    if (recorder.current?.state === 'recording') recorder.current.stop();
    recognition.current = null;
    setListening(false);
  }, []);

  const beginListening = useCallback(async () => {
    setOpen(true);
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
          recorderWillSubmit.current = true;
          mediaRecorder.ondataavailable = (event) => { if (event.data.size) audioChunks.current.push(event.data); };
          mediaRecorder.onstop = async () => {
            stream.getTracks().forEach((track) => track.stop());
            const audio = new Blob(audioChunks.current, { type: mediaRecorder.mimeType || 'audio/webm' });
            try {
              const form = new FormData();
              form.append('audio', audio, 'jamvanta.webm');
              const response = await fetch('/api/jamvanta/transcribe', { method: 'POST', body: form });
              if (!response.ok) throw new Error('fallback');
              const result = await response.json() as { transcript?: string; language?: string };
              if (result.transcript?.trim()) {
                setDraft(result.transcript);
                recorderWillSubmit.current = false;
                await send(result.transcript, result.language);
                return;
              }
            } catch {
              // Sarvam is optional locally; browser speech recognition supplies the transcript.
            }
            const fallbackDraft = latestDraft.current;
            recorderWillSubmit.current = false;
            if (fallbackDraft.trim()) await send(fallbackDraft);
          };
          mediaRecorder.start();
        } else stream.getTracks().forEach((track) => track.stop());
      }
      const instance = new recognitionConstructor();
      recognition.current = instance;
      instance.continuous = false;
      instance.interimResults = true;
      instance.lang = 'en-IN';
      instance.onresult = (event) => {
        let next = '';
        for (let index = 0; index < event.results.length; index += 1) next += event.results[index][0].transcript;
        latestDraft.current = next.trim();
        setDraft(next.trim());
      };
      instance.onerror = () => {
        setNotice('I could not hear that · try again or type below');
        setListening(false);
      };
      instance.onend = () => {
        setListening(false);
        if (recorder.current?.state === 'recording') recorder.current.stop();
        else if (!recorderWillSubmit.current && latestDraft.current.trim()) void send(latestDraft.current);
      };
      instance.start();
      setListening(true);
      setNotice('Listening in English, Hindi or Hinglish…');
    } catch {
      setNotice('Microphone permission is needed · type below instead');
      setListening(false);
    }
  }, [send]);

  const approve = async () => {
    if (!pending || pending.action.type !== 'pay_with_wallet') return;
    setWorking(true);
    try {
      const amount = Number(new URLSearchParams(window.location.search).get('fare')) || 0;
      const prepared = await fetch('/api/jamvanta/approval', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operation: 'wallet-payment', amount }) }).then((response) => response.json()) as { token?: string };
      if (!prepared.token) throw new Error('Approval could not be prepared.');
      const verified = await fetch('/api/jamvanta/approval', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: prepared.token }) }).then((response) => response.json()) as { approved?: boolean };
      if (!verified.approved) throw new Error('Approval expired. Please try again.');
      execute(pending.action);
      updateMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: 'Approved. Completing the mock wallet payment now.' }]);
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
          </div>
          {pending ? <div className="jamvanta-approval"><div><small>CONFIRM BEFORE ACTION</small><strong>Pay from RailSetu Wallet?</strong><span>The exact fare shown on this payment page will be debited.</span></div><div><button type="button" onClick={() => setPending(null)}>Not now</button><button type="button" className="is-primary" onClick={() => void approve()}>{pending.label}</button></div></div> : null}
          <form onSubmit={submit}>
            <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Tell Jamvanta what to do…" aria-label="Message Jamvanta" />
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
