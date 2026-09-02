'use client';

import { useCallback, useEffect, useState } from 'react';
import { readWallet, WALLET_EVENT, type WalletTransaction } from '../lib/wallet';

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export default function RailSetuWallet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
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

  return <div className="railsetu-wallet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="railsetu-wallet-dialog" role="dialog" aria-modal="true" aria-labelledby="railsetu-wallet-title">
      <header><div><span>RAILSETU WALLET · PROTOTYPE</span><h2 id="railsetu-wallet-title">Your travel balance</h2></div><button type="button" aria-label="Close wallet" onClick={onClose}>×</button></header>
      <div className="railsetu-wallet-balance"><small>AVAILABLE MOCK BALANCE</small><strong>{money.format(balance)}</strong><p>Cancellation refunds sent here appear instantly on this device.</p></div>
      <div className="railsetu-wallet-list">
        {transactions.length ? transactions.map((item) => <article key={item.id}><span>↙</span><div><strong>{item.label}</strong><small>{dateTime.format(new Date(item.createdAt))}</small></div><b>+{money.format(item.amount)}</b></article>) : <div className="railsetu-wallet-empty"><span>₹</span><strong>No wallet activity yet.</strong><small>Choose Wallet while cancelling an upcoming mock ticket.</small></div>}
      </div>
      <footer>Prototype wallet · no money or financial information is collected.</footer>
    </section>
  </div>;
}
