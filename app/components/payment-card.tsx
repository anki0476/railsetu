'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type PaymentMode = 'upi' | 'visa' | 'mastercard';
type PaymentState = 'idle' | 'processing' | 'done';

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const modes: Array<{ id: PaymentMode; label: string; detail: string; mark: string }> = [
  { id: 'upi', label: 'UPI', detail: 'railsetu@upi', mark: 'UPI' },
  { id: 'visa', label: 'Card', detail: '•••• 6756', mark: 'VISA' },
  { id: 'mastercard', label: 'Card', detail: '•••• 4632', mark: 'MASTERCARD' },
];

export default function PaymentCard() {
  const params = useSearchParams();
  const [selectedMode, setSelectedMode] = useState<PaymentMode>('upi');
  const [paymentState, setPaymentState] = useState<PaymentState>('idle');
  const paymentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fareValue = Number(params.get('fare'));
  const fare = Number.isFinite(fareValue) && fareValue > 0 ? fareValue : 1440;
  const train = params.get('train') ?? '12310 · Magadh Express';
  const from = params.get('from') ?? 'NDLS';
  const to = params.get('to') ?? 'PNBE';

  useEffect(() => () => {
    if (paymentTimer.current) clearTimeout(paymentTimer.current);
  }, []);

  const proceed = () => {
    if (paymentState !== 'idle') return;
    setPaymentState('processing');
    paymentTimer.current = setTimeout(() => setPaymentState('done'), 1450);
  };

  return (
    <section className="payment-card" aria-labelledby="payment-card-title">
      <div className="payment-card-topline">
        <span className="payment-wallet-icon" aria-hidden="true">
          <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6.5h14a2 2 0 0 1 2 2v9H4a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h12" />
            <path d="M16 11h4" /><circle cx="16" cy="11" r=".7" fill="currentColor" />
          </svg>
        </span>
        <div><span>Total fare</span><strong id="payment-card-title">{money.format(fare)}</strong></div>
        <a href="/planner" className="payment-card-close" aria-label="Return to journey planner">×</a>
      </div>

      <div className="payment-journey-summary">
        <span>Selected journey</span>
        <strong>{from} <i>→</i> {to}</strong>
        <small>{train}</small>
      </div>

      <fieldset className="payment-modes">
        <legend>Payment mode</legend>
        <div className="payment-mode-list">
          {modes.map((mode) => (
            <label className={`payment-mode ${selectedMode === mode.id ? 'is-selected' : ''}`} key={mode.id}>
              <input type="radio" name="payment-mode" value={mode.id} checked={selectedMode === mode.id} onChange={() => setSelectedMode(mode.id)} />
              <span className="payment-radio" aria-hidden="true"><i /></span>
              <span className="payment-mode-copy"><small>{mode.label}</small><strong>{mode.detail}</strong></span>
              <em>{mode.mark}</em>
            </label>
          ))}
        </div>
      </fieldset>

      <span className="tactile-wrap payment-proceed-wrap">
        <span className="tactile-base" aria-hidden="true" />
        <button className={`tactile-cap payment-proceed glare-surface is-${paymentState}`} type="button" onClick={proceed} disabled={paymentState !== 'idle'}>
          {paymentState === 'processing' ? <span className="payment-progress" aria-hidden="true" /> : null}
          <span>{paymentState === 'done' ? 'Payment simulated' : paymentState === 'processing' ? 'Processing…' : 'Proceed to pay'}</span>
          <i aria-hidden="true">{paymentState === 'done' ? '✓' : '→'}</i>
        </button>
      </span>
      <p className="payment-prototype-note">Prototype checkout · no payment will be collected</p>
    </section>
  );
}
