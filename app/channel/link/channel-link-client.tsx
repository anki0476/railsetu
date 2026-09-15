'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

export default function ChannelLinkClient() {
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<'ready'|'working'|'done'|'error'>('ready');
  const [message, setMessage] = useState('Confirm this browser as the RailSetu account connected to your WhatsApp conversation.');
  const confirm = async () => {
    setState('working');
    const response = await fetch('/api/channel/link', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ token }) });
    const data = await response.json() as { linked?:boolean; error?:string };
    if (!response.ok) { setState('error'); setMessage(data.error ?? 'The link could not be completed.'); return; }
    setState('done'); setMessage('Your WhatsApp conversation is now linked. Return to WhatsApp and continue with Jamvanta.');
  };
  return <section className="channel-action-card"><span>RAILSETU · WHATSAPP</span><h1>{state === 'done' ? 'Account linked.' : 'Connect securely.'}</h1><p>{message}</p>{state === 'ready' || state === 'error' ? <button type="button" disabled={!token} onClick={confirm}>Link this account</button> : null}{state === 'working' ? <button type="button" disabled>Linking…</button> : null}{state === 'done' ? <Link href="/planner">Open RailSetu</Link> : null}<small>RailSetu never sends your payment credentials or raw financial data to WhatsApp.</small></section>;
}
