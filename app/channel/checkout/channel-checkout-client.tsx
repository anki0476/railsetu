'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

type Session = { operation:'payment'|'cancellation'; paymentMethod:string|null; expiresAt:number; cancellationRefund:number|null; reservation:{ reservationId:string; itineraryHash:string; itinerary:{ fare:number; train:string; fromName:string; toName:string; date:string } } };

export default function ChannelCheckoutClient() {
  const token = useSearchParams().get('token') ?? '';
  const [session, setSession] = useState<Session|null>(null);
  const [state, setState] = useState<'loading'|'ready'|'working'|'done'|'error'>('loading');
  const [message, setMessage] = useState('');
  useEffect(() => { fetch(`/api/channel/checkout-session?token=${encodeURIComponent(token)}`).then(async (response) => ({ ok:response.ok, data:await response.json() as Session & { error?:string } })).then(({ok,data}) => { if (!ok) throw new Error(data.error ?? 'Secure action is unavailable.'); setSession(data); setState('ready'); }).catch((error:Error) => { setMessage(error.message); setState('error'); }); }, [token]);
  const approve = async () => {
    if (!session) return;
    setState('working');
    try {
      if (session.operation === 'cancellation') {
        const response = await fetch('/api/channel/cancel', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({token}) });
        const data = await response.json() as { error?:string; refund:number }; if (!response.ok) throw new Error(data.error ?? 'Cancellation failed.');
        setMessage(`Cancellation confirmed. Prototype refund: ₹${Number(data.refund).toLocaleString('en-IN')}.`);
      } else {
        const method = session.paymentMethod ?? 'upi';
        const operation = method === 'wallet' ? 'wallet-payment' : `payment-${method}`;
        const approvalResponse = await fetch('/api/jamvanta/approval', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ operation, reservationId:session.reservation.reservationId }) });
        const approval = await approvalResponse.json() as { error?:string; token:string }; if (!approvalResponse.ok) throw new Error(approval.error ?? 'Approval could not be prepared.');
        const checkoutResponse = await fetch(`/api/reservations/${session.reservation.reservationId}/checkout`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ method, approvalToken:approval.token, idempotencyKey:crypto.randomUUID() }) });
        const result = await checkoutResponse.json() as { error?:{message?:string}|string; pnr?:string }; if (!checkoutResponse.ok) throw new Error(typeof result.error === 'string' ? result.error : result.error?.message ?? 'Booking could not be completed.');
        setMessage(`Ticket issued. PNR ${result.pnr}. Jamvanta can now send it in WhatsApp.`);
      }
      setState('done');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The action failed.'); setState('error'); }
  };
  if (state === 'loading') return <section className="channel-action-card"><p>Checking your secure link…</p></section>;
  if (!session) return <section className="channel-action-card"><span>RAILSETU · SECURE ACTION</span><h1>Link unavailable.</h1><p>{message}</p><Link href="/planner">Open RailSetu</Link></section>;
  const itinerary = session.reservation.itinerary;
  return <section className="channel-action-card"><span>RAILSETU · FRESH APPROVAL</span><h1>{state === 'done' ? 'All done.' : session.operation === 'payment' ? 'Approve this payment.' : 'Confirm cancellation.'}</h1><p>{state === 'done' || state === 'error' ? message : `${itinerary.fromName} to ${itinerary.toName} · ${itinerary.train} · ${itinerary.date}`}</p>{state === 'ready' ? <><strong>{session.operation === 'payment' ? `₹${itinerary.fare.toLocaleString('en-IN')}` : `₹${Number(session.cancellationRefund).toLocaleString('en-IN')} refund`}</strong><button type="button" onClick={approve}>{session.operation === 'payment' ? `Approve ${session.paymentMethod}` : 'Confirm cancellation'}</button></> : null}{state === 'working' ? <button type="button" disabled>Processing securely…</button> : null}{state === 'done' ? <Link href="/planner">Open RailSetu</Link> : null}<small>This approval applies only to this exact action and cannot be reused.</small></section>;
}
