'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { plainText } from '../lib/plain-text';

const FEEDBACK_STORAGE_KEY = 'railsetu.feedback.v1';

export default function AboutFeedback() {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('Idea');
  const surfaceRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    textareaRef.current?.focus();
    const close = (event: PointerEvent) => {
      if (surfaceRef.current && !surfaceRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  useEffect(() => () => {
    if (successTimer.current) clearTimeout(successTimer.current);
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanMessage = plainText(message).trim();
    if (!cleanMessage) return;
    try {
      const existing = JSON.parse(window.localStorage.getItem(FEEDBACK_STORAGE_KEY) ?? '[]') as unknown;
      const records = Array.isArray(existing) ? existing.slice(-24) : [];
      records.push({ category, message: cleanMessage.slice(0, 800), createdAt: new Date().toISOString() });
      window.localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(records));
    } catch {
      // The success interaction still works when browser storage is unavailable.
    }
    setMessage('');
    setOpen(false);
    setSent(true);
    successTimer.current = setTimeout(() => setSent(false), 2200);
  };

  const handleKeyboardSubmit = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') setOpen(false);
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <div className={`about-feedback-surface ${open ? 'is-open' : ''} ${sent ? 'is-sent' : ''}`} ref={surfaceRef}>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} aria-expanded="false">
          <span aria-hidden="true">{sent ? '✓' : '●'}</span>
          <strong>{sent ? 'Feedback saved. Thank you!' : 'Share feedback'}</strong>
          <i aria-hidden="true">{sent ? 'Done' : 'Open'}</i>
        </button>
      ) : (
        <form onSubmit={submit}>
          <header>
            <div><small>Help improve RailSetu</small><strong>What should we make better?</strong></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close feedback form">×</button>
          </header>
          <div className="about-feedback-categories" role="group" aria-label="Feedback type">
            {['Idea', 'Confusing', 'Problem'].map((option) => (
              <button className={category === option ? 'is-selected' : ''} type="button" key={option} onClick={() => setCategory(option)}>{option}</button>
            ))}
          </div>
          <textarea ref={textareaRef} name="feedback" value={message} onChange={(event) => setMessage(plainText(event.target.value))} onKeyDown={handleKeyboardSubmit} placeholder="Tell us what happened or what would help…" maxLength={800} required />
          <footer>
            <small>Saved on this device for this prototype</small>
            <button type="submit">Send feedback <span>↗</span></button>
          </footer>
        </form>
      )}
    </div>
  );
}
