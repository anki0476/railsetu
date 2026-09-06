import type { Metadata } from 'next';
import Link from 'next/link';
import AboutScrollIsland from '../components/about-scroll-island';
import BrandMark from '../components/brand-mark';
import BrandTextType from '../components/brand-text-type';
import TactileGlareLink from '../components/tactile-glare-link';

export const metadata: Metadata = {
  title: 'Update documentation — RailSetu',
  description: 'Measured performance and security improvements made to the RailSetu prototype.',
};

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
          <span>Current record · 02 audits</span>
          <p>A transparent record of how the prototype was tested, what changed, and where its boundaries remain.</p>
        </div>
      </header>

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
