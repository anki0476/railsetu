import type { Metadata } from 'next';
import Link from 'next/link';
import AboutScrollIsland from '../components/about-scroll-island';
import BrandMark from '../components/brand-mark';
import BrandTextType from '../components/brand-text-type';
import TactileGlareLink from '../components/tactile-glare-link';

export const metadata: Metadata = {
  title: 'Update documentation — RailSetu',
  description: 'A documented record of RailSetu’s major features, product refinements, performance work and security controls.',
};

const majorUpdates = [
  {
    number: '01',
    title: 'Jamvanta',
    eyebrow: 'Hands-free booking agent',
    summary: 'A bilingual voice agent that can carry a passenger’s intent from the first journey request to an issued, downloadable ticket.',
    details: [
      'GPT-5 Mini interprets English, Hindi and Hinglish requests, while structured tools—not free-form browser guesses—control the planner, journey comparison and payment gateway.',
      'Session memory retains stations, date, class, passenger count, comfort preferences and payment progress across RailSetu pages.',
      'Sarvam speech models improve Indian-language transcription and voice output, with continuous listening and a four-second silence window.',
      'Every payment mode requires a fresh, visible approval. Jamvanta cannot reuse consent, change the approved amount or silently complete another transaction.',
    ],
    outcome: 'A complete booking can ordinarily move from spoken intent to ticket download in three or four passenger prompts.',
  },
  {
    number: '02',
    title: 'Race-safe reservation and payment',
    eyebrow: 'Temporary soft-lock + payment reconciliation',
    summary: 'A five-minute server-side hold prevents two passengers from paying for the same final seat at the same time.',
    details: [
      'The selected itinerary is rechecked and reserved atomically in shared storage before payment is offered.',
      'Cards follow authorize → booking confirmation → capture. Failed bookings void the authorization before money is collected.',
      'Immediately captured modes retain the seat hold and trigger automatic reconciliation and refund records if booking confirmation fails.',
      'Idempotency keys, conditional state transitions and one-time approval nonces prevent duplicate charges, tickets and refunds.',
    ],
    outcome: 'The losing passenger receives refreshed availability before payment; a ticket and PNR appear only after the booking reaches TICKET_ISSUED.',
  },
  {
    number: '03',
    title: 'Multi-passenger planner',
    eyebrow: 'Passenger-aware route intelligence',
    summary: 'RailSetu now evaluates the journey for the whole travelling party instead of treating every booking as one generic passenger.',
    details: [
      'Up to six passengers can carry individual mobility profiles, luggage levels and lower-berth preferences.',
      'Companion relationships and group travel strategies help keep people together or split them only when the journey remains safe.',
      'Coach movement and maximum seat-change limits are applied before a route is recommended.',
      'The comfort score ranks the complete party journey, including transitions, walking, berth suitability and seat continuity.',
    ],
    outcome: 'Recommendations explain the compromises for every passenger while preserving a single continuous itinerary.',
  },
];

const minorUpdates = [
  ['Polished animations', 'Purposeful motion now connects settings, payments, loading states and interactive icons, with reduced-motion support.'],
  ['Ticket cancellation and refunds', 'Eligible journeys can be cancelled and the refund is calculated according to the applicable IRCTC policy represented in the booking flow.'],
  ['Transaction History', 'Ticket payments, wallet activity, cancellations and refunds are recorded together, with a printable receipt for each transaction.'],
  ['Login / Sign up', 'A dedicated passenger account flow provides a clear entry point for saved identity and travel preferences.'],
  ['RailSetu Wallet', 'Passengers can view their balance, pay from the wallet and follow refunds without leaving the booking experience.'],
  ['Optional cursor skin', 'The RailSetu cursor treatment can be enabled or disabled from More options without changing the rest of the interface.'],
  ['Google Calendar sync', 'Journey details can be added to the passenger’s schedule as a calendar event with the relevant travel timing.'],
  ['DigiLocker linking', 'A mock DigiLocker connection gives passenger profiles a clear path for verified travel-document linking.'],
  ['Richer passenger profiles', 'Main and additional passenger profiles now capture travel preferences and the details needed for more accurate recommendations.'],
  ['Sarvam voice dictation', 'Indian-language speech recognition and synthesis improve Hindi and bilingual dictation for Jamvanta.'],
  ['Direct sharing', 'Passengers can share tickets and route maps directly from their respective journey surfaces.'],
  ['Google Maps route view', 'The View on Map experience uses Google Maps with RailSetu segment lines, station markers and theme-aware presentation.'],
  ['Passenger gender and age', 'Gender and age fields are available for the main passenger and every additional traveller.'],
  ['Categorised ticket history', 'Ticket history is organised into All, Upcoming, Cancelled and Completed views for quicker retrieval.'],
];

const performanceMetrics = [
  ['Initial interface JavaScript', '238.5 KB', '20.1 KB', '91.6% less'],
  ['Language loader', '75.5 KB', '2.7 KB', '96.4% less'],
  ['Animated icon code', '130.1 KB', '4.0 KB', '96.9% less'],
  ['Settings shell', '32.9 KB', '13.4 KB', '59.3% less'],
];

const routeTimings = [
  ['Landing page', '258.7 ms', '38.3 ms'],
  ['About page', '198.1 ms', '28.2 ms'],
  ['Journey planner', '180.2 ms', '33.4 ms'],
  ['Payment page', '139.6 ms', '16.0 ms'],
];

const securityControls = [
  ['Provider-credit abuse', 'Same-origin checks and per-client rate limits now protect AI, speech and journey-search routes.'],
  ['Oversized requests', 'JSON and audio requests have explicit size limits before expensive processing begins.'],
  ['Payment approval replay', 'Approval tokens are signed, narrowly scoped, short-lived and rejected after one successful use.'],
  ['Slow upstream services', 'Provider calls now stop at defined timeouts instead of holding a request indefinitely.'],
  ['Browser attack surface', 'Content, framing, referrer, permissions and MIME-sniffing policies are enforced with response headers.'],
  ['Dependency exposure', 'Production packages were upgraded and now report zero known production dependency advisories.'],
];

const adversarialChecks = [
  ['Cross-origin API request', 'Blocked', '403'],
  ['Wrong content type', 'Rejected', '415'],
  ['Oversized request', 'Rejected', '413'],
  ['Malformed approval token', 'Rejected', '400'],
  ['Replayed approval token', 'Rejected', '400'],
  ['Rate-limit threshold exceeded', 'Throttled', '429'],
  ['Injected ticket script markup', 'Escaped', 'No execution'],
];

const updateTopics = [
  { id: 'updates-introduction', title: 'Update documentation' },
  { id: 'major-updates', title: 'Major updates' },
  { id: 'minor-updates', title: 'Minor updates' },
  { id: 'performance', title: 'Performance audit' },
  { id: 'security', title: 'Security audit' },
  { id: 'updates-scope', title: 'Living document' },
];

export default function UpdatesPage() {
  return (
    <main className="updates-page">
      <nav className="nav-wrap updates-nav" aria-label="Update documentation navigation">
        <Link className="brand" href="/" aria-label="RailSetu home">
          <BrandMark />
          <BrandTextType />
        </Link>
        <TactileGlareLink className="nav-cta" href="/about" baseColor="#aebfdf" depth={4} glareOpacity={0.2}>
          Back to about <span>↙</span>
        </TactileGlareLink>
      </nav>

      <AboutScrollIsland topics={updateTopics} label="Update documentation index" />

      <header className="updates-hero" id="updates-introduction">
        <div>
          <p className="section-kicker">RailSetu update documentation</p>
          <h1>Measured changes.<br /><span>Verifiable results.</span></h1>
        </div>
        <div className="updates-hero-note">
          <span>Current record · 17 updates + 02 audits</span>
          <p>A transparent record of what RailSetu can do, how the system changed, how it was tested and where its boundaries remain.</p>
        </div>
      </header>

      <section className="updates-release-section updates-major" id="major-updates" aria-labelledby="major-updates-title">
        <header className="updates-release-heading">
          <p className="section-kicker">Major updates</p>
          <h2 id="major-updates-title">The systems that changed<br /><span>what RailSetu can do.</span></h2>
          <p>These are architectural additions: they reshape the booking journey, its safety model and the intelligence used for a travelling party.</p>
        </header>
        <div className="updates-major-list">
          {majorUpdates.map((update) => (
            <article key={update.number}>
              <div className="updates-major-index"><span>{update.number}</span><p>{update.eyebrow}</p></div>
              <div className="updates-major-copy">
                <h3>{update.title}</h3>
                <p className="updates-major-summary">{update.summary}</p>
                <ul>{update.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
                <div className="updates-outcome"><span>Result</span><p>{update.outcome}</p></div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="updates-release-section updates-minor" id="minor-updates" aria-labelledby="minor-updates-title">
        <header className="updates-release-heading">
          <p className="section-kicker">Minor updates</p>
          <h2 id="minor-updates-title">Smaller additions.<br /><span>A more complete journey.</span></h2>
          <p>Focused improvements across identity, accessibility, payments, journey management and everyday usability.</p>
        </header>
        <div className="updates-minor-grid">
          {minorUpdates.map(([title, description], index) => (
            <article key={title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div><h3>{title}</h3><p>{description}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="updates-audit" id="performance" aria-labelledby="performance-title">
        <header className="updates-audit-heading">
          <div><span>Audit 01</span><time dateTime="2026-09-07">07 September 2026</time></div>
          <p className="section-kicker">Performance</p>
          <h2 id="performance-title">A lighter first load,<br /><span>with the interface left intact.</span></h2>
          <p>Heavy features were moved off the initial path and loaded only when needed. Layout, interactions and visual styling were preserved.</p>
        </header>

        <div className="updates-metrics" aria-label="Performance comparison">
          <div className="updates-table-head"><span>Measured area</span><span>Before</span><span>After</span><span>Change</span></div>
          {performanceMetrics.map(([label, before, after, change]) => (
            <div className="updates-metric-row" key={label}>
              <strong>{label}</strong><span>{before}</span><span>{after}</span><b>{change}</b>
            </div>
          ))}
        </div>

        <div className="updates-audit-grid">
          <article>
            <span>What changed</span>
            <h3>Load capability when it is requested.</h3>
            <ul>
              <li>Hindi translations load only after Hindi is selected.</li>
              <li>Settings dialogs are deferred until their controls are opened.</li>
              <li>Jamvanta loads only on routes where voice assistance is available.</li>
              <li>Small icon effects use native CSS instead of a large motion runtime.</li>
            </ul>
          </article>
          <article className="updates-route-card">
            <span>Warm local route median</span>
            <h3>Directional response check</h3>
            {routeTimings.map(([route, before, after]) => (
              <div key={route}><strong>{route}</strong><s>{before}</s><b>{after}</b></div>
            ))}
          </article>
        </div>

        <aside className="updates-method-note">
          <strong>How this was measured</strong>
          <p>JavaScript figures compare emitted assets from equivalent production builds. Route timings are warm local medians on the same development machine; they show direction, not a universal network benchmark. CSS increased by 4 KB because the lightweight icon motion moved from JavaScript into styles.</p>
        </aside>
      </section>

      <section className="updates-audit updates-security" id="security" aria-labelledby="security-title">
        <header className="updates-audit-heading">
          <div><span>Audit 02</span><time dateTime="2026-09-07">07 September 2026</time></div>
          <p className="section-kicker">Security</p>
          <h2 id="security-title">Smaller attack surface.<br /><span>Stricter trust boundaries.</span></h2>
          <p>The public application was reviewed from browser input to server routes and third-party provider calls, then tested with deliberately hostile requests.</p>
        </header>

        <div className="updates-security-result">
          <strong>0</strong>
          <div><span>Known production dependency advisories</span><p>after package remediation and a production-only dependency audit.</p></div>
        </div>

        <div className="updates-control-list">
          {securityControls.map(([risk, fix], index) => (
            <article key={risk}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div><h3>{risk}</h3><p>{fix}</p></div>
            </article>
          ))}
        </div>

        <div className="updates-verification">
          <header><span>Adversarial verification</span><h3>Expected failure is a successful defence.</h3></header>
          <div role="table" aria-label="Security test outcomes">
            {adversarialChecks.map(([test, result, signal]) => (
              <div role="row" key={test}>
                <span role="cell">{test}</span><strong role="cell">{result}</strong><b role="cell">{signal}</b>
              </div>
            ))}
          </div>
        </div>

        <aside className="updates-method-note">
          <strong>Scope and limits</strong>
          <p>This was an application-layer engineering audit, not an independent penetration test or a claim of banking-grade certification. RailSetu&apos;s inventory, wallet and payment flows remain prototype simulations; production integration would require authorised railway and payment infrastructure, server-side identity, durable ledgers and an external security review.</p>
        </aside>
      </section>

      <footer className="updates-footer" id="updates-scope">
        <div><span>Living document</span><p>Future RailSetu changes will be added here as separate, dated records.</p></div>
        <Link href="/about">Return to the project story <b aria-hidden="true">→</b></Link>
      </footer>
    </main>
  );
}
