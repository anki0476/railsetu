'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { RailSetuTransaction } from '../lib/transactions';

export type ReceiptPrinterStage = 'processing' | 'printing' | 'complete';

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export default function ReceiptPrinter({ transaction, stage, onPrint }: { transaction: RailSetuTransaction; stage: ReceiptPrinterStage; onPrint: () => void }) {
  const reducedMotion = useReducedMotion();
  const visible = stage !== 'processing';
  return <section className="receipt-printer" data-stage={stage} aria-label="Receipt printer">
    <div className="receipt-printer-machine">
      <header><span className="receipt-printer-logo">RS</span><strong>RailSetu receipt</strong><em>{stage === 'processing' ? 'Preparing' : stage === 'printing' ? 'Printing' : 'Ready'}</em></header>
      <div className="receipt-printer-screen"><div><span>{transaction.label}</span><strong>{money.format(Math.abs(transaction.amount))}</strong></div><p><i className={stage === 'complete' ? 'is-complete' : ''}>{stage === 'complete' ? '✓' : '↻'}</i>{stage === 'processing' ? 'Preparing transaction details' : stage === 'printing' ? 'Printing your receipt' : 'Receipt ready to print'}</p></div>
      <span className="receipt-printer-slot" aria-hidden="true" />
    </div>
    <div className="receipt-printer-output">
      <AnimatePresence initial={false}>
        {visible ? <motion.article className="receipt-paper" initial={reducedMotion ? false : { y: '-96%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: reducedMotion ? 0 : 1.35, ease: stage === 'printing' ? [0.77, 0, 0.175, 1] : 'easeOut' }}>
          <span>RAILSETU</span><h3>Transaction receipt</h3><hr /><dl><div><dt>Description</dt><dd>{transaction.label}</dd></div><div><dt>Type</dt><dd>{transaction.kind}</dd></div><div><dt>Method</dt><dd>{transaction.method}</dd></div><div><dt>Date</dt><dd>{dateTime.format(new Date(transaction.createdAt))}</dd></div>{transaction.reference ? <div><dt>Reference</dt><dd>{transaction.reference}</dd></div> : null}<div className="receipt-paper-total"><dt>{transaction.amount < 0 ? 'Paid' : 'Amount'}</dt><dd>{money.format(Math.abs(transaction.amount))}</dd></div></dl><p>Saved locally on this device.</p>
          {stage === 'complete' ? <button type="button" onClick={onPrint}>Print receipt <span>↗</span></button> : null}
        </motion.article> : null}
      </AnimatePresence>
    </div>
  </section>;
}
