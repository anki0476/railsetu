'use client';

import { useCallback, useEffect, useState } from 'react';
import { readTransactions, TRANSACTION_EVENT, type RailSetuTransaction } from '../lib/transactions';
import ReceiptPrinter, { type ReceiptPrinterStage } from './receipt-printer';

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export default function TransactionHistory({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [items, setItems] = useState<RailSetuTransaction[]>([]);
  const [receipt, setReceipt] = useState<RailSetuTransaction | null>(null);
  const [stage, setStage] = useState<ReceiptPrinterStage>('processing');
  const refresh = useCallback(() => setItems(readTransactions()), []);
  const openReceipt = useCallback((item: RailSetuTransaction) => {
    setStage('processing');
    setReceipt(item);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const refreshTimer = window.setTimeout(refresh, 0);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (receipt) setReceipt(null);
      else onClose();
    };
    window.addEventListener('storage', refresh);
    window.addEventListener(TRANSACTION_EVENT, refresh);
    document.addEventListener('keydown', escape);
    return () => { window.clearTimeout(refreshTimer); document.body.style.overflow = overflow; window.removeEventListener('storage', refresh); window.removeEventListener(TRANSACTION_EVENT, refresh); document.removeEventListener('keydown', escape); };
  }, [isOpen, onClose, receipt, refresh]);

  useEffect(() => {
    if (!receipt) return;
    const printing = window.setTimeout(() => setStage('printing'), 350);
    const complete = window.setTimeout(() => setStage('complete'), 1850);
    return () => { window.clearTimeout(printing); window.clearTimeout(complete); };
  }, [receipt]);

  if (!isOpen) return null;
  return <div className="transaction-history-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="transaction-history-dialog" role="dialog" aria-modal="true" aria-labelledby="transaction-history-title">
      <header><div><span>PAYMENTS & REFUNDS</span><h2 id="transaction-history-title">Transaction history</h2></div><button type="button" aria-label="Close transaction history" onClick={onClose}>×</button></header>
      <div className="transaction-history-list">
        {items.length ? items.map((item) => <article key={item.id} className={`is-${item.kind}`}><span aria-hidden="true">{item.kind === 'payment' ? '↗' : '↙'}</span><div><strong>{item.label}</strong><small>{item.method} · {dateTime.format(new Date(item.createdAt))}</small>{item.reference ? <em>{item.reference}</em> : null}</div><b>{item.amount < 0 ? '−' : '+'}{money.format(Math.abs(item.amount))}</b><button type="button" onClick={() => openReceipt(item)}>Print receipt</button></article>) : <div className="transaction-history-empty"><span>₹</span><strong>No transactions yet</strong><p>Ticket payments, refunds and wallet top-ups will appear here.</p></div>}
      </div>
      <footer>Stored only on this device · {items.length} {items.length === 1 ? 'transaction' : 'transactions'}</footer>
    </section>
    {receipt ? <div className="receipt-printer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReceipt(null); }}><div className="receipt-printer-dialog" role="dialog" aria-modal="true" aria-label={`Receipt for ${receipt.label}`}><button type="button" aria-label="Close receipt" onClick={() => setReceipt(null)}>×</button><ReceiptPrinter transaction={receipt} stage={stage} onPrint={() => window.print()} /></div></div> : null}
  </div>;
}
