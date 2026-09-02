'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { createPortal } from 'react-dom';
import TypingKeyboard from '../typing-keyboard';

type Auth10Props = { open: boolean; onClose: () => void };
type AuthMode = 'login' | 'signup';

function GoogleIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4h5.4a4.7 4.7 0 0 1-2 3v2.7h3.4c2-1.9 2.8-4.5 2.8-7.5Z" fill="#4285F4"/><path d="M12 22c2.8 0 5.1-.9 6.8-2.4L15.4 17c-.9.6-2.1 1-3.4 1a6 6 0 0 1-5.6-4.1H2.9v2.8A10 10 0 0 0 12 22Z" fill="#34A853"/><path d="M6.4 13.9A6 6 0 0 1 6.1 12c0-.7.1-1.3.3-1.9V7.3H2.9A10 10 0 0 0 2 12c0 1.7.4 3.3.9 4.7l3.5-2.8Z" fill="#FBBC05"/><path d="M12 6c1.5 0 2.9.5 4 1.5l3-3A10 10 0 0 0 2.9 7.3l3.5 2.8A6 6 0 0 1 12 6Z" fill="#EA4335"/></svg>;
}

export default function Auth10({ open, onClose }: Auth10Props) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [status, setStatus] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', keydown);
    requestAnimationFrame(() => closeRef.current?.focus());
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', keydown); };
  }, [open, onClose]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(mode === 'login' ? 'Demo login complete — no information was sent.' : 'Demo account created — no information was sent.');
  };

  if (typeof document === 'undefined') return null;
  return createPortal(<AnimatePresence>{open ? (
    <motion.div className="railsetu-auth-backdrop" role="presentation" initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <motion.section className="railsetu-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="railsetu-auth-title" initial={reducedMotion ? false : { opacity: 0, y: 18, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: .98 }} transition={{ type: 'spring', stiffness: 300, damping: 28 }}>
        <button className="railsetu-auth-close" ref={closeRef} type="button" onClick={onClose} aria-label="Close login and sign up">×</button>
        <aside className="railsetu-auth-visual"><span>RAILSETU ACCESS</span><TypingKeyboard /><div><strong>Your journey, sorted!</strong><small>Keep preferences and mock tickets together on this device.</small></div></aside>
        <div className="railsetu-auth-form-panel">
          <span className="railsetu-auth-kicker">Passenger account · prototype</span>
          <h2 id="railsetu-auth-title">{mode === 'login' ? 'Welcome back' : 'Create your RailSetu account'}</h2>
          <p>This is a demonstration. Use mock information only.</p>
          <div className="railsetu-auth-tabs" role="tablist" aria-label="Choose login or sign up"><button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => { setMode('login'); setStatus(''); }}>Login</button><button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => { setMode('signup'); setStatus(''); }}>Sign up</button></div>
          <form onSubmit={submit}>
            {mode === 'signup' ? <label><span>Name</span><input required autoComplete="off" placeholder="Mock passenger name" /></label> : null}
            <label><span>Email address</span><input required type="email" autoComplete="off" placeholder="passenger@example.com" /></label>
            <label><span>Password</span><input required type="password" autoComplete="off" minLength={6} placeholder="At least 6 characters" /></label>
            {mode === 'signup' ? <label className="railsetu-auth-consent"><input required type="checkbox" /><span aria-hidden="true">✓</span><strong>I agree to the prototype terms</strong></label> : null}
            <button className="railsetu-auth-submit" type="submit">{mode === 'login' ? 'Login' : 'Create mock account'} <span aria-hidden="true">→</span></button>
          </form>
          <div className="railsetu-auth-divider"><span>or continue with</span></div>
          <div className="railsetu-auth-social"><button type="button" onClick={() => setStatus('Demo Google login complete — no account was contacted.')}><GoogleIcon /> Google</button><button type="button" onClick={() => setStatus('Demo IRCTC login complete — no account was contacted.')}><span aria-hidden="true">✦</span> IRCTC</button></div>
          {status ? <p className="railsetu-auth-status" role="status">{status}</p> : null}
        </div>
      </motion.section>
    </motion.div>
  ) : null}</AnimatePresence>, document.body);
}
