'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { OTPField, OTPFieldInput } from './ui/otp-field';
import { addWalletTransaction, getWalletBalance, WALLET_EVENT } from '../lib/wallet';
import { dispatchJamvantaFeedback, JAMVANTA_ACTION_EVENT, type JamvantaAction } from '../lib/jamvanta';
import { plainText } from '../lib/plain-text';
import { CameraIcon, ScanLineIcon, UploadIcon } from './ui/animated-icons';

type PaymentMode = string;
type PaymentState = 'idle' | 'processing' | 'done';
type OTPState = 'hidden' | 'filling' | 'verified';
type CardScanState = 'idle' | 'choosing' | 'filled';
type AddedCard = { id: string; last4: string; holder: string; expiry: string; mark: string; saved: boolean };
type CardDraft = { number: string; holder: string; expiry: string; cvv: string; save: boolean };

const OTP_LENGTH = 6;
const OTP_VALUE = '675624';
const OTP_SLOT_KEYS = Array.from({ length: OTP_LENGTH }, (_, index) => `otp-slot-${index}`);
const SAVED_CARD_STORAGE_KEY = 'railsetu.mock-cards.v1';
const EMPTY_CARD: CardDraft = { number: '', holder: '', expiry: '', cvv: '', save: false };

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const modes: Array<{ id: PaymentMode; label: string; detail: string; mark: string }> = [
  { id: 'upi', label: 'UPI', detail: 'railsetu@upi', mark: 'UPI' },
  { id: 'visa', label: 'Card', detail: '•••• 6756', mark: 'VISA' },
  { id: 'mastercard', label: 'Card', detail: '•••• 4632', mark: 'MASTERCARD' },
];

export default function PaymentCard({ initialSearch }: { initialSearch: string }) {
  const params = useMemo(() => new URLSearchParams(initialSearch), [initialSearch]);
  const [selectedMode, setSelectedMode] = useState<PaymentMode>('upi');
  const [walletBalance, setWalletBalance] = useState(0);
  const [paymentState, setPaymentState] = useState<PaymentState>('idle');
  const [otpState, setOtpState] = useState<OTPState>('hidden');
  const [otpValue, setOtpValue] = useState('');
  const [cardDialogOpen, setCardDialogOpen] = useState(false);
  const [cardDraft, setCardDraft] = useState<CardDraft>(EMPTY_CARD);
  const [cardError, setCardError] = useState('');
  const [cardScanState, setCardScanState] = useState<CardScanState>('idle');
  const [addedCards, setAddedCards] = useState<AddedCard[]>([]);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(SAVED_CARD_STORAGE_KEY) ?? '[]') as AddedCard[];
      if (!Array.isArray(stored)) return;
      const restoreTimer = window.setTimeout(() => setAddedCards(stored.slice(0, 3)), 0);
      return () => window.clearTimeout(restoreTimer);
    } catch {
      // Built-in payment options remain available when storage is unavailable.
    }
  }, []);
  const paymentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handoffTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const otpTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const cardNumberInput = useRef<HTMLInputElement>(null);
  const fareValue = Number(params.get('fare'));
  const fare = Number.isFinite(fareValue) && fareValue > 0 ? fareValue : 1440;
  const train = params.get('train') ?? '12310 · Magadh Express';
  const from = params.get('from') ?? 'NDLS';
  const to = params.get('to') ?? 'PNBE';

  useEffect(() => {
    const refreshWallet = () => setWalletBalance(getWalletBalance());
    refreshWallet();
    window.addEventListener('storage', refreshWallet);
    window.addEventListener(WALLET_EVENT, refreshWallet);
    return () => { window.removeEventListener('storage', refreshWallet); window.removeEventListener(WALLET_EVENT, refreshWallet); };
  }, []);

  useEffect(() => () => {
    if (paymentTimer.current) clearTimeout(paymentTimer.current);
    if (handoffTimer.current) clearTimeout(handoffTimer.current);
    otpTimers.current.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (!cardDialogOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCardDialogOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    requestAnimationFrame(() => cardNumberInput.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [cardDialogOpen]);

  const closeCardDialog = () => {
    setCardDialogOpen(false);
    setCardDraft(EMPTY_CARD);
    setCardError('');
    setCardScanState('idle');
  };

  const mockAutofillFromCardImage = (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) return;
    setCardScanState('filled');
    setCardError('');
    setCardDraft((current) => ({ ...current, number: '4242 4242 4242 4242', holder: 'Ravi Kishan', expiry: '09/29', cvv: '123' }));
    event.target.value = '';
  };

  const addMockCard = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const digits = cardDraft.number.replace(/\D/g, '');
    if (digits.length < 12 || digits.length > 19 || !cardDraft.holder.trim() || !/^\d{2}\/\d{2}$/.test(cardDraft.expiry) || !/^\d{3,4}$/.test(cardDraft.cvv)) {
      setCardError('Complete every field using valid mock card details.');
      return;
    }
    const card: AddedCard = {
      id: `added-${window.crypto.randomUUID()}`,
      last4: digits.slice(-4),
      holder: cardDraft.holder.trim().toUpperCase(),
      expiry: cardDraft.expiry,
      mark: digits.startsWith('4') ? 'VISA' : 'CARD',
      saved: cardDraft.save,
    };
    setAddedCards((current) => {
      const next = [card, ...current].slice(0, 3);
      if (cardDraft.save) {
        try {
          window.localStorage.setItem(SAVED_CARD_STORAGE_KEY, JSON.stringify(next.filter((item) => item.saved)));
        } catch {
          // The card remains available during this visit if storage is unavailable.
        }
      }
      return next;
    });
    setSelectedMode(card.id);
    closeCardDialog();
    dispatchJamvantaFeedback(`Card ending ${card.last4} has been added and selected. Say “use card ending ${card.last4}” when you are ready to continue.`);
  };

  const completePayment = useCallback((mode: PaymentMode) => {
    if (paymentState !== 'idle') return;
    if (mode === 'wallet') {
      if (walletBalance < fare) return;
      addWalletTransaction({ id: `payment-${window.crypto.randomUUID()}`, amount: -fare, label: `Ticket · ${train}`, createdAt: Date.now() });
    }
    setPaymentState('processing');
    paymentTimer.current = setTimeout(() => {
      setPaymentState('done');
      const ticketParams = new URLSearchParams(params.toString());
      ticketParams.set('mode', mode);
      handoffTimer.current = setTimeout(() => {
        window.location.assign(`/ticket?${ticketParams.toString()}`);
      }, 850);
    }, 1450);
  }, [fare, params, paymentState, train, walletBalance]);

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
    if (selectedMode === 'upi' || selectedMode === 'wallet') completePayment(selectedMode);
    else beginOtpVerification();
  };

  useEffect(() => {
    const handleJamvanta = (event: Event) => {
      const action = (event as CustomEvent<JamvantaAction>).detail;
      if (action.type === 'select_wallet') setSelectedMode('wallet');
      if (action.type === 'pay_with_wallet') {
        setSelectedMode('wallet');
        completePayment('wallet');
      }
      if (action.type === 'pay_with_method') {
        const requestedMode = action.mode.startsWith('card-')
          ? addedCards.find((card) => card.last4 === action.mode.slice(5))?.id
          : action.mode;
        if (!requestedMode) return;
        setSelectedMode(requestedMode);
        completePayment(requestedMode);
      }
      if (action.type === 'add_payment_method' && action.methodType === 'card') setCardDialogOpen(true);
    };
    window.addEventListener(JAMVANTA_ACTION_EVENT, handleJamvanta);
    return () => window.removeEventListener(JAMVANTA_ACTION_EVENT, handleJamvanta);
  }, [addedCards, completePayment]);

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
          <label className={`payment-mode payment-mode-wallet ${selectedMode === 'wallet' ? 'is-selected' : ''} ${walletBalance < fare ? 'is-disabled' : ''}`} aria-disabled={walletBalance < fare}>
            <input type="radio" name="payment-mode" value="wallet" checked={selectedMode === 'wallet'} disabled={walletBalance < fare} onChange={() => setSelectedMode('wallet')} />
            <span className="payment-radio" aria-hidden="true"><i /></span>
            <span className="payment-mode-copy"><small>RailSetu Wallet</small><strong>{money.format(walletBalance)} available</strong>{walletBalance < fare ? <span>Insufficient balance</span> : null}</span>
            <em>WALLET</em>
          </label>
          {addedCards.map((card) => (
            <label className={`payment-mode ${selectedMode === card.id ? 'is-selected' : ''}`} key={card.id}>
              <input type="radio" name="payment-mode" value={card.id} checked={selectedMode === card.id} onChange={() => setSelectedMode(card.id)} />
              <span className="payment-radio" aria-hidden="true"><i /></span>
              <span className="payment-mode-copy"><small>Mock card</small><strong>•••• {card.last4}</strong></span>
              <em>{card.mark}</em>
            </label>
          ))}
          <button className="payment-add-card" type="button" onClick={() => setCardDialogOpen(true)}>
            <span aria-hidden="true">＋</span><span><strong>Add another card</strong><small>Use mock details only</small></span><i aria-hidden="true">›</i>
          </button>
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
      {cardDialogOpen && typeof document !== 'undefined' ? createPortal((
        <div className="payment-add-card-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCardDialog(); }}>
          <section className="payment-add-card-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-add-card-title">
            <button className="payment-add-card-close" type="button" aria-label="Close add card" onClick={closeCardDialog}>×</button>
            <div className="payment-glass-card" tabIndex={0} role="img" aria-label={`Mock RailSetu card ending ${cardDraft.number.replace(/\D/g, '').slice(-4) || '0000'}`}>
              <div className="payment-glass-card-top"><span>RAILSETU <em>✦</em></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8.6a6.4 6.4 0 0 1 0 6.8M9.6 6.4a10.4 10.4 0 0 1 0 11.2M13.2 4.2a14.6 14.6 0 0 1 0 15.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg></div>
              <div className="payment-glass-card-chip" aria-hidden="true" />
              <p>{`••••  ••••  ••••  ${cardDraft.number.replace(/\D/g, '').slice(-4).padStart(4, '0')}`}</p>
              <div className="payment-glass-card-meta"><span><em>Card holder</em>{cardDraft.holder || 'Ravi Kishan'}</span><span><em>Expires</em>{cardDraft.expiry || 'MM/YY'}</span><b aria-hidden="true"><i /><i /></b></div>
            </div>
            <div className="payment-add-card-heading"><small>Prototype card</small><h2 id="payment-add-card-title">Add a mock card</h2><p>For demonstration only. Do not enter real financial information.</p></div>
            <div className={`payment-card-scan is-${cardScanState}`}>
              <button type="button" aria-expanded={cardScanState !== 'idle'} aria-controls="payment-card-scan-options" onClick={() => setCardScanState((current) => current === 'idle' ? 'choosing' : 'idle')}><span aria-hidden="true"><ScanLineIcon /></span><strong>Scan Card</strong><i aria-hidden="true">⌄</i></button>
              {cardScanState !== 'idle' ? <div id="payment-card-scan-options" className="payment-card-scan-options">
                <label><input type="file" accept="image/*" onChange={mockAutofillFromCardImage} /><span aria-hidden="true"><UploadIcon /></span><div><strong>Upload card photo</strong><small>Choose a clear image from this device</small></div></label>
                <label><input type="file" accept="image/*" capture="environment" onChange={mockAutofillFromCardImage} /><span aria-hidden="true"><CameraIcon /></span><div><strong>Use camera</strong><small>Take a clear picture of the card</small></div></label>
              </div> : null}
              {cardScanState === 'filled' ? <p role="status">Demo details filled. The image was not uploaded or stored.</p> : null}
            </div>
            <form onSubmit={addMockCard}>
              <label className="payment-card-number-field"><span>Card number</span><input ref={cardNumberInput} inputMode="numeric" autoComplete="off" placeholder="4242 4242 4242 4242" value={cardDraft.number} onChange={(event) => setCardDraft((current) => ({ ...current, number: event.target.value.replace(/[^\d ]/g, '').slice(0, 23) }))} /></label>
              <label><span>Name on card</span><input autoComplete="off" placeholder="Ravi Kishan" value={cardDraft.holder} onChange={(event) => setCardDraft((current) => ({ ...current, holder: plainText(event.target.value, 30) }))} /></label>
              <label><span>Expiry</span><input inputMode="numeric" autoComplete="off" placeholder="09/29" value={cardDraft.expiry} onChange={(event) => setCardDraft((current) => ({ ...current, expiry: event.target.value.replace(/[^\d/]/g, '').slice(0, 5) }))} /></label>
              <label><span>CVV</span><input type="password" inputMode="numeric" autoComplete="off" placeholder="123" value={cardDraft.cvv} onChange={(event) => setCardDraft((current) => ({ ...current, cvv: event.target.value.replace(/\D/g, '').slice(0, 4) }))} /></label>
              <label className="payment-save-card-check"><input type="checkbox" checked={cardDraft.save} onChange={(event) => setCardDraft((current) => ({ ...current, save: event.target.checked }))} /><span aria-hidden="true">✓</span><strong>Save for future use</strong></label>
              {cardError ? <p className="payment-card-form-error" role="alert">{cardError}</p> : null}
              <p className="payment-card-storage-note">Only the mock card label and last four digits are stored. The full number and CVV are discarded.</p>
              <button className="payment-add-card-submit" type="submit">Add mock card <span>→</span></button>
            </form>
          </section>
        </div>
      ), document.body) : null}
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
