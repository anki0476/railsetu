'use client';

import { useCallback, useEffect, useState } from 'react';
import { clearTicketHistory, readTicketHistory, type TicketHistoryItem } from '../lib/ticket-history';

interface JourneyHistoryProps {
  isOpen: boolean;
  onClose: () => void;
}

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

function HistoryTicketIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5V9a2 2 0 0 0 0 4v2.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 15.5V13a2 2 0 0 0 0-4Z" /><path d="M9 8h6M9 12h4" />
    </svg>
  );
}

export default function JourneyHistory({ isOpen, onClose }: JourneyHistoryProps) {
  const [items, setItems] = useState<TicketHistoryItem[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);

  const refresh = useCallback(() => setItems(readTicketHistory()), []);

  useEffect(() => {
    if (!isOpen) return;
    refresh();
    setConfirmClear(false);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('storage', refresh);
    window.addEventListener('railsetu:ticket-history-updated', refresh);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('storage', refresh);
      window.removeEventListener('railsetu:ticket-history-updated', refresh);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose, refresh]);

  if (!isOpen) return null;

  const clearAll = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    clearTicketHistory();
    setItems([]);
    setConfirmClear(false);
  };

  return (
    <div className="journey-history-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="journey-history-dialog" role="dialog" aria-modal="true" aria-labelledby="journey-history-title">
        <header>
          <div>
            <span>Journey archive</span>
            <h2 id="journey-history-title">Ticket history</h2>
          </div>
          <button type="button" aria-label="Close ticket history" onClick={onClose}>×</button>
        </header>

        {items.length ? (
          <div className="journey-history-list">
            {items.map((item) => (
              <article key={item.id}>
                <span className="journey-history-ticket-icon"><HistoryTicketIcon /></span>
                <div className="journey-history-main">
                  <small>{item.train}</small>
                  <h3>{item.from} <i>→</i> {item.to}</h3>
                  <p>{item.fromName} to {item.toName}</p>
                </div>
                <dl>
                  <div><dt>Journey date</dt><dd>{item.journeyDate}</dd></div>
                  <div><dt>Purchased</dt><dd>{dateTime.format(new Date(item.purchasedAt))}</dd></div>
                  <div><dt>Total fare</dt><dd>{money.format(item.fare)}</dd></div>
                </dl>
                <a href={item.ticketUrl}>View ticket <span>↗</span></a>
              </article>
            ))}
          </div>
        ) : (
          <div className="journey-history-empty">
            <span><HistoryTicketIcon /></span>
            <h3>No tickets yet.</h3>
            <p>Your first confirmed ticket will appear here as soon as its QR code is generated.</p>
            <a href="/planner">Plan a journey <span>→</span></a>
          </div>
        )}

        <footer>
          <p>Saved on this device · {items.length} {items.length === 1 ? 'ticket' : 'tickets'}</p>
          {items.length ? (
            <div className="journey-history-clear">
              {confirmClear ? <span>This removes every saved ticket.</span> : null}
              <button className={confirmClear ? 'is-confirming' : ''} type="button" onClick={clearAll}>
                {confirmClear ? 'Confirm clear' : 'Clear history'}
              </button>
              {confirmClear ? <button type="button" onClick={() => setConfirmClear(false)}>Cancel</button> : null}
            </div>
          ) : null}
        </footer>
      </section>
    </div>
  );
}
