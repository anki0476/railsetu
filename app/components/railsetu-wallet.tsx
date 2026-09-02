'use client';

import { useCallback, useEffect, useState } from 'react';
import { addWalletTransaction, readWallet, WALLET_EVENT, type WalletTransaction } from '../lib/wallet';

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export default function RailSetuWallet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [addingMoney, setAddingMoney] = useState(false);
  const [amount, setAmount] = useState('500');
  const refresh = useCallback(() => setTransactions(readWallet()), []);

  useEffect(() => {
    if (!isOpen) return;
    refresh();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('storage', refresh);
    window.addEventListener(WALLET_EVENT, refresh);
    document.addEventListener('keydown', escape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('storage', refresh);
      window.removeEventListener(WALLET_EVENT, refresh);
      document.removeEventListener('keydown', escape);
    };
  }, [isOpen, onClose, refresh]);

  if (!isOpen) return null;
  const balance = transactions.reduce((sum, item) => sum + item.amount, 0);

  const addMockMoney = () => {
    const value = Math.round(Number(amount));
    if (!Number.isFinite(value) || value < 1 || value > 10000) return;
    addWalletTransaction({ id: `topup-${window.crypto.randomUUID()}`, amount: value, label: 'Mock wallet top-up', createdAt: Date.now() });
    setAddingMoney(false);
  };

  return <div className="railsetu-wallet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="railsetu-wallet-dialog" role="dialog" aria-modal="true" aria-labelledby="railsetu-wallet-title">
      <header><div><span>RAILSETU WALLET · PROTOTYPE</span><h2 id="railsetu-wallet-title">Your travel balance</h2></div><button type="button" aria-label="Close wallet" onClick={onClose}>×</button></header>
      <div className="railsetu-wallet-balance"><small>AVAILABLE MOCK BALANCE</small><strong>{money.format(balance)}</strong><p>Cancellation refunds sent here appear instantly on this device.</p><button type="button" onClick={() => setAddingMoney((current) => !current)}>＋ Add money</button></div>
      {addingMoney ? <div className="railsetu-wallet-add" aria-label="Add mock money"><div><strong>Add mock money</strong><small>No payment or financial information is requested.</small></div><label><span>₹</span><input type="number" min="1" max="10000" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} aria-label="Mock amount" /></label><div className="railsetu-wallet-presets">{[500, 1000, 2000].map((value) => <button type="button" key={value} onClick={() => setAmount(String(value))}>+₹{value.toLocaleString('en-IN')}</button>)}</div><button className="railsetu-wallet-add-submit" type="button" onClick={addMockMoney}>Add to wallet <span>→</span></button></div> : null}
      <div className="railsetu-wallet-list">
        {transactions.length ? transactions.map((item) => <article key={item.id} className={item.amount < 0 ? 'is-debit' : ''}><span>{item.amount < 0 ? '↗' : '↙'}</span><div><strong>{item.label}</strong><small>{dateTime.format(new Date(item.createdAt))}</small></div><b>{item.amount < 0 ? '−' : '+'}{money.format(Math.abs(item.amount))}</b></article>) : <div className="railsetu-wallet-empty"><span>₹</span><strong>No wallet activity yet.</strong><small>Add mock money or choose Wallet while cancelling a ticket.</small></div>}
      </div>
      <footer>Prototype wallet · no money or financial information is collected.</footer>
    </section>
  </div>;
}
