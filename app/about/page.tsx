import type { Metadata } from 'next';
import AboutScrollIsland from '../components/about-scroll-island';
import BrandTextType from '../components/brand-text-type';
import TactileGlareLink from '../components/tactile-glare-link';

export const metadata: Metadata = {
  title: 'About RailSetu — A precise way through the waitlist',
  description: 'How RailSetu turns confirmed train segments into one clear, passenger-aware journey.',
};

const process = [
  ['01', 'Map the whole train', 'Read availability across the train’s route, not only the requested origin and destination.'],
  ['02', 'Join confirmed segments', 'Build continuous options that keep the traveller on the same train while seats or coaches change.'],
  ['03', 'Rank for the person', 'Filter by mobility, luggage, family needs and comfortable interchange time before showing the clearest route.'],
];

const aboutTopics = [
  { id: 'about-introduction', title: 'About RailSetu' },
  { id: 'about-overview', title: 'The problem and the idea' },
  { id: 'about-process', title: 'How the engine thinks' },
  { id: 'about-traveller', title: 'Built around the traveller' },
  { id: 'about-scope', title: 'Prototype scope' },
];

export default function AboutPage() {
  return (
    <main className="about-page">
      <nav className="nav-wrap about-nav" aria-label="About navigation">
        <a className="brand" href="/" aria-label="RailSetu home">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <BrandTextType />
        </a>
        <TactileGlareLink
          className="nav-cta"
          wrapperClassName="nav-about-wrap"
          href="/"
          baseColor="#aebfdf"
          depth={4}
          glareOpacity={0.2}
        >
          Back home <span>↙</span>
        </TactileGlareLink>
      </nav>

      <AboutScrollIsland topics={aboutTopics} />

      <section className="about-hero" id="about-introduction">
        <p className="section-kicker">About RailSetu</p>
        <h1>One waitlisted ticket.<br /><span>A route that still works.</span></h1>
        <p>
          RailSetu is a passenger-first journey planner for Indian train travellers.
          When a direct ticket is waitlisted, it looks for confirmed segments on the
          same train and explains the changes as one simple journey.
        </p>
      </section>

      <section className="about-grid" id="about-overview" aria-label="Project overview">
        <article className="about-feature">
          <span>The problem</span>
          <h2>Availability is fragmented. The journey should not be.</h2>
          <p>A berth may be unavailable from point A to B even when confirmed seats exist across smaller parts of that exact route. Finding those combinations manually is slow, confusing and easy to get wrong.</p>
        </article>
        <article className="about-feature about-feature-blue">
          <span>The idea</span>
          <h2>Stay on the train. Change only what is necessary.</h2>
          <p>RailSetu searches for a continuous chain of confirmed segments, then makes every seat or coach transition visible before the traveller chooses it.</p>
        </article>
      </section>

      <section className="about-process" id="about-process">
        <p className="section-kicker">How the engine thinks</p>
        <h2>From scattered seats to one clear plan.</h2>
        <div className="about-steps">
          {process.map(([number, title, copy]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-care" id="about-traveller">
        <div>
          <p className="section-kicker">Built around the traveller</p>
          <h2>The shortest route is not always the right route.</h2>
        </div>
        <ul>
          <li><span>01</span>Keep coach changes close for elderly or mobility-limited travellers.</li>
          <li><span>02</span>Reduce changes for families, children and heavier luggage.</li>
          <li><span>03</span>Explain every transition with station, time, coach and seat details.</li>
        </ul>
      </section>

      <footer className="about-footer" id="about-scope">
        <div>
          <span>Prototype scope</span>
          <p>RailSetu is an independent civic-tech concept and is not affiliated with Indian Railways or IRCTC.</p>
        </div>
        <TactileGlareLink
          className="nav-cta"
          wrapperClassName="about-preview-wrap"
          href="/#preview"
          baseColor="#9daed8"
          depth={5}
          glareOpacity={0.24}
        >
          View journey preview <span>→</span>
        </TactileGlareLink>
      </footer>
    </main>
  );
}
