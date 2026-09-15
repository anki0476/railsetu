import { Suspense } from 'react';
import ChannelLinkClient from './channel-link-client';

export default function ChannelLinkPage() {
  return <main className="channel-action-page"><Suspense fallback={<section className="channel-action-card"><p>Preparing secure account link…</p></section>}><ChannelLinkClient /></Suspense></main>;
}
