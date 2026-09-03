'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { clearTicketHistory, readTicketHistory, updateTicketInHistory, type TicketHistoryItem } from '../lib/ticket-history';
import { addWalletRefund } from '../lib/wallet';

interface JourneyHistoryProps { isOpen: boolean; onClose: () => void; }
type HistoryFilter = 'all' | 'upcoming' | 'cancelled' | 'completed';
type RefundDestination = 'original' | 'wallet';

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const filters: Array<{ id: HistoryFilter; label: string }> = [{ id: 'all', label: 'All' }, { id: 'upcoming', label: 'Upcoming' }, { id: 'cancelled', label: 'Cancelled' }, { id: 'completed', label: 'Completed' }];

function HistoryTicketIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5V9a2 2 0 0 0 0 4v2.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 15.5V13a2 2 0 0 0 0-4Z"/><path d="M9 8h6M9 12h4"/></svg>;
}

function startOfToday() { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); }
function itemStatus(item: TicketHistoryItem): Exclude<HistoryFilter, 'all'> { if (item.status === 'cancelled') return 'cancelled'; return new Date(`${item.journeyDate}T00:00:00`).getTime() >= startOfToday() ? 'upcoming' : 'completed'; }

function ticketUrlForStatus(item: TicketHistoryItem, status: Exclude<HistoryFilter, 'all'>) {
  if (status !== 'cancelled') return item.ticketUrl;
  const [path, query = ''] = item.ticketUrl.split('?');
  const params = new URLSearchParams(query);
  params.set('status', 'cancelled');
  return `${path}?${params.toString()}`;
}

function departureTime(item: TicketHistoryItem) {
  try {
    const firstLeg = new URL(item.ticketUrl, window.location.origin).searchParams.get('legs')?.split('|')[0]?.split('~');
    const time = firstLeg?.[1]?.match(/^\d{2}:\d{2}$/) ? firstLeg[1] : '12:00';
    return new Date(`${item.journeyDate}T${time}:00`).getTime();
  } catch { return new Date(`${item.journeyDate}T12:00:00`).getTime(); }
}

function refundQuote(item: TicketHistoryItem) {
  const hours = (departureTime(item) - Date.now()) / 3_600_000;
  let classCode = '3A';
  try { classCode = new URL(item.ticketUrl, window.location.origin).searchParams.get('class') ?? '3A'; } catch { /* use 3A */ }
  const flat: Record<string, number> = { '1A': 240, EC: 240, '2A': 200, FC: 200, '3A': 180, CC: 180, '3E': 180, SL: 120, '2S': 60 };
  const minimum = flat[classCode] ?? 180;
  const isAc = ['1A', 'EC', '2A', 'FC', '3A', 'CC', '3E'].includes(classCode);
  let baseCharge = minimum;
  let rule = 'More than 48 hours before departure: flat class-based charge.';
  if (hours <= 4) return { charge: item.fare, refund: 0, rule: 'Within four hours of departure: no refund for a confirmed ticket.' };
  if (hours <= 12) { baseCharge = Math.max(item.fare * .5, minimum); rule = 'Between 12 and 4 hours: 50% of fare, subject to the minimum charge.'; }
  else if (hours <= 48) { baseCharge = Math.max(item.fare * .25, minimum); rule = 'Between 48 and 12 hours: 25% of fare, subject to the minimum charge.'; }
  const charge = Math.min(item.fare, Math.round(baseCharge * (isAc ? 1.05 : 1)));
  return { charge, refund: Math.max(0, item.fare - charge), rule: `${rule}${isAc ? ' Includes an estimated 5% GST on the cancellation charge.' : ''}` };
}

export default function JourneyHistory({ isOpen, onClose }: JourneyHistoryProps) {
  const [items, setItems] = useState<TicketHistoryItem[]>([]);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [confirmClear, setConfirmClear] = useState(false);
  const [cancelling, setCancelling] = useState<TicketHistoryItem | null>(null);
  const [destination, setDestination] = useState<RefundDestination>('original');
  const refresh = useCallback(() => setItems(readTicketHistory()), []);

  useEffect(() => {
    if (!isOpen) return;
    refresh(); setConfirmClear(false); setFilter('all'); setCancelling(null);
    const previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('storage', refresh); window.addEventListener('railsetu:ticket-history-updated', refresh); document.addEventListener('keydown', escape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('storage', refresh); window.removeEventListener('railsetu:ticket-history-updated', refresh); document.removeEventListener('keydown', escape); };
  }, [isOpen, onClose, refresh]);

  const visibleItems = useMemo(() => filter === 'all' ? items : items.filter((item) => itemStatus(item) === filter), [filter, items]);
  if (!isOpen) return null;
  const quote = cancelling ? refundQuote(cancelling) : null;
  const clearAll = () => { if (!confirmClear) return setConfirmClear(true); clearTicketHistory(); setItems([]); setConfirmClear(false); };
  const confirmCancellation = () => {
    if (!cancelling || !quote) return;
    const cancelledAt = Date.now();
    updateTicketInHistory(cancelling.id, { status: 'cancelled', cancelledAt, refundAmount: quote.refund, refundDestination: destination });
    if (destination === 'wallet' && quote.refund > 0) addWalletRefund({ id: `refund-${cancelling.id}`, amount: quote.refund, label: `Refund · ${cancelling.train}`, createdAt: cancelledAt });
    setItems(readTicketHistory()); setCancelling(null); setFilter('cancelled');
  };

  return <div className="journey-history-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="journey-history-dialog" role="dialog" aria-modal="true" aria-labelledby="journey-history-title">
      <header><div><span>Journey archive</span><h2 id="journey-history-title">Ticket history</h2></div><button type="button" aria-label="Close ticket history" onClick={onClose}>×</button></header>
      <nav className="journey-history-filters" aria-label="Filter ticket history">{filters.map((entry) => <button className={filter === entry.id ? 'is-active' : ''} type="button" key={entry.id} aria-pressed={filter === entry.id} onClick={() => setFilter(entry.id)}>{entry.label}<span>{items.filter((item) => entry.id === 'all' || itemStatus(item) === entry.id).length}</span></button>)}</nav>
      {visibleItems.length ? <div className="journey-history-list">{visibleItems.map((item) => { const status = itemStatus(item); return <article key={item.id} className={`is-${status}`}>
        <span className="journey-history-ticket-icon"><HistoryTicketIcon /></span>
        <div className="journey-history-main"><small>{item.train}</small><h3>{item.from} <i>→</i> {item.to}</h3><p>{item.fromName} to {item.toName}</p><em className={`journey-history-status is-${status}`}>{status}</em></div>
        <dl><div><dt>Journey date</dt><dd>{item.journeyDate}</dd></div><div><dt>Purchased</dt><dd>{dateTime.format(new Date(item.purchasedAt))}</dd></div><div><dt>{status === 'cancelled' ? 'Refund' : 'Total fare'}</dt><dd>{money.format(status === 'cancelled' ? item.refundAmount ?? 0 : item.fare)}</dd></div></dl>
        <div className="journey-history-actions"><a href={ticketUrlForStatus(item, status)}>View ticket <span>↗</span></a>{status === 'upcoming' ? <button type="button" onClick={() => { setDestination('original'); setCancelling(item); }}>Cancel ticket</button> : null}</div>
      </article>; })}</div> : <div className="journey-history-empty"><span><HistoryTicketIcon /></span><h3>No {filter === 'all' ? 'tickets' : filter + ' tickets'}.</h3><p>{filter === 'upcoming' ? 'New confirmed journeys will appear here until their travel date.' : 'There is nothing in this category yet.'}</p>{filter === 'all' ? <a href="/planner">Plan a journey <span>→</span></a> : null}</div>}
      <footer><p>Saved on this device · {items.length} {items.length === 1 ? 'ticket' : 'tickets'}</p>{items.length ? <div className="journey-history-clear">{confirmClear ? <span>This removes every saved ticket.</span> : null}<button className={confirmClear ? 'is-confirming' : ''} type="button" onClick={clearAll}>{confirmClear ? 'Confirm clear' : 'Clear history'}</button>{confirmClear ? <button type="button" onClick={() => setConfirmClear(false)}>Keep history</button> : null}</div> : null}</footer>
    </section>
    {cancelling && quote ? <div className="ticket-cancel-backdrop" role="presentation"><section className="ticket-cancel-dialog" role="dialog" aria-modal="true" aria-labelledby="ticket-cancel-title"><header><span>PROTOTYPE CANCELLATION</span><button type="button" aria-label="Close cancellation" onClick={() => setCancelling(null)}>×</button></header><h3 id="ticket-cancel-title">Cancel {cancelling.from} → {cancelling.to}?</h3><p>The refund estimate follows the current confirmed-ticket time bands published by IRCTC.</p><div className="ticket-cancel-quote"><div><span>Ticket fare</span><strong>{money.format(cancelling.fare)}</strong></div><div><span>Estimated deduction</span><strong>−{money.format(quote.charge)}</strong></div><div><span>Estimated refund</span><strong>{money.format(quote.refund)}</strong></div></div><small className="ticket-cancel-rule">{quote.rule} <a href="https://contents.irctc.co.in/en/RefundCancellationRules.pdf" target="_blank" rel="noreferrer">Official rules ↗</a></small><fieldset><legend>Send refund to</legend><label><input type="radio" name="refund-destination" checked={destination === 'original'} onChange={() => setDestination('original')}/><span><strong>Original payment source</strong><small>Mock refund status only</small></span></label><label><input type="radio" name="refund-destination" checked={destination === 'wallet'} onChange={() => setDestination('wallet')}/><span><strong>RailSetu Wallet</strong><small>Credits this device instantly</small></span></label></fieldset><div className="ticket-cancel-actions"><button type="button" onClick={() => setCancelling(null)}>Keep ticket</button><button type="button" onClick={confirmCancellation}>Cancel mock ticket · refund {money.format(quote.refund)}</button></div><em>No railway booking or payment is changed.</em></section></div> : null}
  </div>;
}
