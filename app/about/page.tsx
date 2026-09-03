import type { Metadata } from 'next';
import Link from 'next/link';
import AboutScrollIsland from '../components/about-scroll-island';
import BrandMark from '../components/brand-mark';
import BrandTextType from '../components/brand-text-type';
import TactileGlareLink from '../components/tactile-glare-link';
import HandwrittenSignature from '../components/handwritten-signature';
import TechnologyLoop from '../components/technology-loop';
import AboutFeedback from '../components/about-feedback';

export const metadata: Metadata = {
  title: 'About RailSetu — A precise way through the waitlist',
  description: 'How RailSetu turns confirmed train segments into one clear, passenger-aware journey.',
};

const process = [
  ['01', 'Map the whole train', 'Read availability across the train’s route, not only the requested origin and destination.'],
  ['02', 'Join confirmed segments', 'Build continuous options that keep the traveller on the same train while seats or coaches change.'],
  ['03', 'Rank for the person', 'Filter by mobility, luggage, family needs and comfortable interchange time before showing the clearest route.'],
];

const buildQuestions = [
  {
    question: 'Who is facing the problem?',
    answer: 'Indian train travellers whose direct option is waitlisted—especially elderly passengers, families, people with limited mobility and anyone carrying luggage who cannot treat every seat or coach change as equally easy.',
  },
  {
    question: 'What is difficult about the current experience?',
    answer: 'Availability is usually checked as one origin-to-destination request. Confirmed berths across consecutive portions of the same train remain hidden, leaving travellers to repeat searches, compare stations and verify continuity manually.',
  },
  {
    question: 'What did RailSetu change?',
    answer: 'RailSetu treats a train route as a chain of bookable segments. It joins confirmed segments on the same train, filters them against traveller constraints and explains the station, time, coach and seat involved in every change.',
  },
  {
    question: 'Why is this version better?',
    answer: 'It turns fragmented availability into one understandable journey. Travellers can compare confirmed paths by effort—not only fare—using an explainable Comfort Score, visible transitions, a route map and saved preferences.',
  },
  {
    question: 'What works today, and what is still mocked?',
    answer: 'The end-to-end experience, segmentation logic, traveller-aware filtering, Comfort Score, saved presets, map, checkout handoff and downloadable ticket work in the prototype. Live inventory, reservation locking, payment and official ticket issuance currently use representative data or simulated integrations.',
  },
  {
    question: 'How could the idea work safely at a larger scale?',
    answer: 'Use authorised railway APIs, revalidate every segment before payment and reserve every leg atomically—or charge nothing. Minimise and encrypt personal data, audit ranking decisions, monitor availability and keep RailSetu clearly labelled as a planner until official booking integration is approved.',
  },
];

const aboutTopics = [
  { id: 'about-introduction', title: 'About RailSetu' },
  { id: 'about-overview', title: 'The problem and the idea' },
  { id: 'about-process', title: 'How the engine thinks' },
  { id: 'about-traveller', title: 'Built around the traveller' },
  { id: 'about-comfort-simple', title: 'Comfort Score, simply' },
  { id: 'about-refund-policy', title: 'Cancellation refunds' },
  { id: 'about-build-clarity', title: 'What the build makes clear' },
  { id: 'about-technology', title: 'Technology stack' },
  { id: 'about-feedback', title: 'Share feedback' },
  { id: 'about-scope', title: 'Prototype scope' },
];

export default function AboutPage() {
  return (
    <main className="about-page">
      <nav className="nav-wrap about-nav" aria-label="About navigation">
        <a className="brand" href="/" aria-label="RailSetu home">
          <BrandMark />
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

      <section className="about-comfort-simple" id="about-comfort-simple" aria-labelledby="about-comfort-simple-title">
        <div className="about-comfort-simple-heading">
          <p className="section-kicker">Comfort Score, in the simplest words</p>
          <h2 id="about-comfort-simple-title">How easy will this journey feel?</h2>
          <p>Think of it as an effort meter, not a promise that a ticket will be confirmed.</p>
        </div>
        <div className="about-comfort-simple-body">
          <div className="about-comfort-meter" aria-label="Example Comfort Score: 89 out of 100">
            <strong>89</strong><span>out of 100</span><small>Very comfortable</small>
          </div>
          <ol>
            <li><span>1</span><div><strong>Start at 100.</strong><p>A simple journey begins with a full score.</p></div></li>
            <li><span>2</span><div><strong>Small chores remove points.</strong><p>Changing seats, managing another ticket, walking to a different coach, moving at night, or getting the wrong berth makes the number smaller.</p></div></li>
            <li><span>3</span><div><strong>Your needs decide how much.</strong><p>The same change matters more for an elderly traveller, a family, or someone carrying heavy luggage. Staying in one coach or matching a requested lower berth can add a few points back.</p></div></li>
          </ol>
        </div>
        <div className="about-comfort-bands" aria-label="Comfort Score meanings">
          <span><b>90–100</b>Very easy</span><span><b>80–89</b>Comfortable</span><span><b>65–79</b>Manageable</span><span><b>Below 65</b>More effort</span>
        </div>
        <p className="about-comfort-bottomline"><strong>Big number = easier journey.</strong> RailSetu uses it to rank valid paths; it never replaces live availability or a booking confirmation. <Link href="/comfort-score">See the full calculation →</Link></p>
      </section>

      <section className="about-refund-policy" id="about-refund-policy" aria-labelledby="about-refund-policy-title">
        <div>
          <p className="section-kicker">Cancelled-ticket refunds</p>
          <h2 id="about-refund-policy-title">Earlier cancellations usually mean a larger refund.</h2>
        </div>
        <p>For confirmed tickets, RailSetu estimates the deduction using IRCTC&apos;s time bands: a class-based charge more than 48 hours before departure, 25% from 48–12 hours, 50% from 12–4 hours, and no refund inside four hours. Minimum charges and GST may apply. The Wallet destination is a prototype convenience; official e-ticket refunds normally return to the original payment account. <a href="https://contents.irctc.co.in/en/RefundCancellationRules.pdf" target="_blank" rel="noreferrer">Read the official rules ↗</a></p>
      </section>

      <section className="about-clarity" id="about-build-clarity">
        <div className="about-clarity-heading">
          <p className="section-kicker">What the build makes obvious</p>
          <h2>Six questions.<br /><span>Clear answers.</span></h2>
          <p>RailSetu is designed so the problem, the intervention and the prototype&apos;s limits are visible without a pitch.</p>
        </div>
        <div className="about-clarity-list">
          {buildQuestions.map(({ question, answer }, index) => (
            <article key={question}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h3>{question}</h3>
                <p>{answer}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="about-technology" id="about-technology" aria-labelledby="about-technology-title">
        <div className="about-technology-heading">
          <p className="section-kicker">Under the hood</p>
          <h2 id="about-technology-title">The stack behind RailSetu.</h2>
          <p>Every language, framework, library and production tool currently used to build and run the experience.</p>
        </div>
        <TechnologyLoop />
        <p className="about-technology-note">Move your pointer over the stack to pause it.</p>
      </section>

      <section className="about-feedback" id="about-feedback" aria-labelledby="about-feedback-title">
        <div>
          <p className="section-kicker">Made with travellers</p>
          <h2 id="about-feedback-title">See something we can improve?</h2>
          <p>Tell us what felt useful, confusing, or missing. Short and honest is perfect.</p>
        </div>
        <AboutFeedback />
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

      <HandwrittenSignature />
    </main>
  );
}
