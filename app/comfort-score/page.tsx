import type { Metadata } from 'next';
import BrandTextType from '../components/brand-text-type';
import TactileGlareLink from '../components/tactile-glare-link';

export const metadata: Metadata = {
  title: 'RailSetu Comfort Score — How journey comfort is calculated',
  description: 'The transparent, traveller-aware method RailSetu uses to rank confirmed segmented train journeys.',
};

const scoreBands = [
  ['90–100', 'Effortless'],
  ['80–89', 'Very comfortable'],
  ['65–79', 'Manageable'],
  ['50–64', 'High effort'],
  ['0–49', 'Not recommended'],
];

export default function ComfortScorePage() {
  return (
    <main className="about-page comfort-score-page">
      <nav className="nav-wrap about-nav" aria-label="Comfort score navigation">
        <a className="brand" href="/" aria-label="RailSetu home">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <BrandTextType />
        </a>
        <TactileGlareLink className="nav-cta" wrapperClassName="nav-about-wrap" href="/planner" baseColor="#aebfdf" depth={4} glareOpacity={0.2}>
          Back to planner <span>↙</span>
        </TactileGlareLink>
      </nav>

      <section className="about-hero comfort-score-hero">
        <p className="section-kicker">The RailSetu Comfort Score</p>
        <h1>One number.<br /><span>Every trade-off explained.</span></h1>
        <p>Every eligible journey begins at 100. RailSetu then applies transparent bonuses and penalties for the work that journey asks of the selected traveller.</p>
      </section>

      <section className="comfort-formula" aria-label="Comfort score formula">
        <span>Starting comfort</span><strong>100</strong><i>−</i><span>Traveller burden</span><i>+</i><span>Comfort bonuses</span><b>= 0–100</b>
      </section>

      <section className="about-grid comfort-score-grid" aria-label="Comfort score factors">
        <article className="about-feature">
          <span>Transition burden</span>
          <h2>Changing seats is not equally easy for everyone.</h2>
          <ul className="comfort-weight-list">
            <li><b>−4</b><span>Each seat change before traveller adjustments</span></li>
            <li><b>−10</b><span>Each coach change, plus coach distance</span></li>
            <li><b>−2</b><span>Each additional confirmed ticket</span></li>
            <li><b>0.85×</b><span>Transition burden when travelling without luggage</span></li>
          </ul>
        </article>
        <article className="about-feature about-feature-blue">
          <span>Timing & berth fit</span>
          <h2>A confirmed seat can still be an uncomfortable seat.</h2>
          <ul className="comfort-weight-list">
            <li><b>−5</b><span>Each change between 10 PM and 6 AM</span></li>
            <li><b>−9</b><span>Middle berth when lower is preferred</span></li>
            <li><b>−15</b><span>Upper berth when lower is preferred</span></li>
          </ul>
        </article>
      </section>

      <section className="about-process comfort-multipliers">
        <p className="section-kicker">Personalised weighting</p>
        <h2>The same route can feel different to a different traveller.</h2>
        <div className="about-steps">
          <article><span>1.0×</span><h3>Regular adult</h3><p>The base transition burden.</p></article>
          <article><span>1.25×</span><h3>Family or heavy luggage</h3><p>Changes require more coordination and time.</p></article>
          <article><span>1.5×</span><h3>Elderly traveller</h3><p>Seat and coach movement carry greater weight.</p></article>
        </div>
      </section>

      <section className="about-care comfort-score-bands">
        <div>
          <p className="section-kicker">Reading the result</p>
          <h2>A ranking, not a guarantee.</h2>
          <p>Hard preferences—such as “No coach changes”—filter journeys out before scoring. The score ranks only the confirmed paths that remain.</p>
        </div>
        <ul>
          {scoreBands.map(([range, label]) => <li key={range}><span>{range}</span>{label}</li>)}
        </ul>
      </section>

      <footer className="about-footer comfort-score-footer">
        <div><span>Explainable by design</span><p>The score is recalculated whenever traveller, luggage, berth or coach preferences change.</p></div>
        <TactileGlareLink className="nav-cta" wrapperClassName="about-preview-wrap" href="/planner" baseColor="#9daed8" depth={5} glareOpacity={0.24}>
          Compare journeys <span>→</span>
        </TactileGlareLink>
      </footer>
    </main>
  );
}
