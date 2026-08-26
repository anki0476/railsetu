import type { Metadata } from 'next';
import BrandTextType from '../components/brand-text-type';
import JourneyPlanner from '../components/journey-planner';
import TactileGlareLink from '../components/tactile-glare-link';

export const metadata: Metadata = {
  title: 'RailSetu Journey Planner — Find confirmed paths',
  description: 'Build passenger-aware confirmed train journeys from available segments on the same train.',
};

export default function PlannerPage() {
  return (
    <main className="planner-page">
      <div className="planner-ambient planner-ambient-one" />
      <div className="planner-ambient planner-ambient-two" />

      <nav className="nav-wrap planner-nav" aria-label="Planner navigation">
        <a className="brand" href="/" aria-label="RailSetu landing page">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <BrandTextType />
        </a>
        <span className="planner-nav-context"><i /> Journey planner</span>
        <TactileGlareLink
          className="nav-cta"
          wrapperClassName="nav-about-wrap"
          href="/about"
          baseColor="#aebfdf"
          depth={4}
          glareOpacity={0.2}
        >
          About RailSetu <span>↗</span>
        </TactileGlareLink>
      </nav>

      <header className="planner-hero">
        <div>
          <p className="eyebrow"><span /> Passenger-aware route intelligence</p>
          <h1>Find the confirmed<br /><span>path inside the waitlist.</span></h1>
        </div>
        <p>Tell RailSetu who is travelling. The engine joins available segments on the same train, rejects uncomfortable transitions, and ranks the journeys that remain.</p>
      </header>

      <JourneyPlanner />

      <footer className="planner-footer">
        <span>RailSetu · independent civic-tech prototype</span>
        <a href="/">Return to the landing page <i>↗</i></a>
      </footer>
    </main>
  );
}
