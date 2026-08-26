import type { Metadata } from 'next';
import { Suspense } from 'react';
import ScrollExpandTicket from '../components/scroll-expand-ticket';

export const metadata: Metadata = {
  title: 'Your RailSetu Mock Ticket',
  description: 'Reveal and download the mock ticket for your confirmed RailSetu journey.',
};

export default function TicketPage() {
  return (
    <main className="ticket-reveal-page">
      <Suspense fallback={<div className="ticket-reveal-fallback" aria-label="Preparing ticket" />}>
        <ScrollExpandTicket />
      </Suspense>
    </main>
  );
}
