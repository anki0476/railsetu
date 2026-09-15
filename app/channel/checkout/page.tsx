import { Suspense } from 'react';
import ChannelCheckoutClient from './channel-checkout-client';

export default function ChannelCheckoutPage() {
  return <main className="channel-action-page"><Suspense fallback={<section className="channel-action-card"><p>Loading secure action…</p></section>}><ChannelCheckoutClient /></Suspense></main>;
}
