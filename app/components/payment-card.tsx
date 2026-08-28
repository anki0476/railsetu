'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { OTPField, OTPFieldInput } from './ui/otp-field';

type PaymentMode = 'upi' | 'visa' | 'mastercard';
type PaymentState = 'idle' | 'processing' | 'done';
type OTPState = 'hidden' | 'filling' | 'verified';

const OTP_LENGTH = 6;
const OTP_VALUE = '675624';
const OTP_SLOT_KEYS = Array.from({ length: OTP_LENGTH }, (_, index) => `otp-slot-${index}`);

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
  const [otpState, setOtpState] = useState<OTPState>('hidden');
  const [otpValue, setOtpValue] = useState('');
  const paymentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handoffTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const otpTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const fareValue = Number(params.get('fare'));
  const fare = Number.isFinite(fareValue) && fareValue > 0 ? fareValue : 1440;
  const train = params.get('train') ?? '12310 · Magadh Express';
  const from = params.get('from') ?? 'NDLS';
  const to = params.get('to') ?? 'PNBE';

  useEffect(() => () => {
    if (paymentTimer.current) clearTimeout(paymentTimer.current);
    if (handoffTimer.current) clearTimeout(handoffTimer.current);
    otpTimers.current.forEach(clearTimeout);
  }, []);

  const completePayment = (mode: PaymentMode) => {
    if (paymentState !== 'idle') return;
    setPaymentState('processing');
    paymentTimer.current = setTimeout(() => {
      setPaymentState('done');
      const ticketParams = new URLSearchParams(params.toString());
      ticketParams.set('mode', mode);
      handoffTimer.current = setTimeout(() => {
        window.location.assign(`/ticket?${ticketParams.toString()}`);
      }, 850);
    }, 1450);
  };

  const beginOtpVerification = () => {
    setOtpValue('');
    setOtpState('filling');
    OTP_VALUE.split('').forEach((_, index) => {
      otpTimers.current.push(setTimeout(() => setOtpValue(OTP_VALUE.slice(0, index + 1)), 350 + index * 220));
    });
    otpTimers.current.push(setTimeout(() => setOtpState('verified'), 350 + OTP_LENGTH * 220));
    otpTimers.current.push(setTimeout(() => {
      setOtpState('hidden');
      completePayment(selectedMode);
    }, 350 + OTP_LENGTH * 220 + 700));
  };

  const proceed = () => {
    if (paymentState !== 'idle') return;
    if (selectedMode === 'upi') completePayment(selectedMode);
    else beginOtpVerification();
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
          <span>{paymentState === 'done' ? 'Payment Successful' : paymentState === 'processing' ? 'Processing…' : 'Proceed to pay'}</span>
          <i aria-hidden="true">{paymentState === 'done' ? '✓' : '→'}</i>
        </button>
      </span>
      <p className="payment-prototype-note">Prototype checkout · no payment will be collected</p>
      {otpState !== 'hidden' && typeof document !== 'undefined' ? createPortal((
        <div className="payment-otp-backdrop" role="presentation">
          <section className="payment-otp-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-otp-title">
            <span className="payment-otp-icon" aria-hidden="true">✦</span>
            <small>Mock card verification</small>
            <h2 id="payment-otp-title">Confirm your payment</h2>
            <p>A one-time password was sent to the mobile number linked with this demo card.</p>
            <OTPField aria-label="One-time password" length={OTP_LENGTH} value={otpValue} onChange={setOtpValue}>
              {OTP_SLOT_KEYS.map((slotKey, index) => (
                <OTPFieldInput key={slotKey} index={index} aria-label={`Character ${index + 1} of ${OTP_LENGTH}`} readOnly={otpState !== 'filling'} />
              ))}
            </OTPField>
            <strong className={`payment-otp-status is-${otpState}`} aria-live="polite">
              {otpState === 'verified' ? '✓ OTP verified — continuing securely' : 'Autofilling demo OTP…'}
            </strong>
            <p className="payment-otp-note">Prototype only · no OTP is sent and no payment is collected</p>
          </section>
        </div>
      ), document.body) : null}
    </section>
  );
}
