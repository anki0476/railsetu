'use client';

import { useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

const rows = [
  'QWERTYUIOP',
  'ASDFGHJKL',
  'ZXCVBNM',
];

export default function TypingKeyboard({ text = "Waitlist.....\nIt's Done bro!\nYour journeys, preferences and tickets — together in RailSetu." }: { text?: string }) {
  const reducedMotion = useReducedMotion();
  const [position, setPosition] = useState(0);
  const visibleText = useMemo(() => reducedMotion ? text : text.slice(0, position), [position, reducedMotion, text]);
  const activeKey = text[position - 1]?.toUpperCase();

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setTimeout(() => setPosition((current) => current >= text.length ? 0 : current + 1), position >= text.length ? 1700 : 72);
    return () => window.clearTimeout(timer);
  }, [position, reducedMotion, text]);

  return (
    <div className="auth-keyboard-scene" aria-hidden="true">
      <div className="auth-keyboard-screen"><span style={{ whiteSpace: 'pre-line' }}>{visibleText}</span><i /></div>
      <div className="auth-keyboard">
        {rows.map((row) => <div className="auth-keyboard-row" key={row}>{[...row].map((key) => <span className={activeKey === key ? 'is-pressed' : ''} key={key}>{key}</span>)}</div>)}
        <div className="auth-keyboard-row auth-keyboard-row-bottom"><span>⌘</span><span className={activeKey === ' ' ? 'is-pressed auth-space-key' : 'auth-space-key'}>RailSetu</span><span>↵</span></div>
      </div>
    </div>
  );
}
