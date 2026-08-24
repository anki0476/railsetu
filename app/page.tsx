import TactileGlareLink from './components/tactile-glare-link';
import BrandTextType from './components/brand-text-type';

const journeyStops = [
  { code: 'PUNE', time: '18:35', state: 'Board', active: true },
  { code: 'SUR', time: '22:10', state: 'Seat change', active: true },
  { code: 'HYB', time: '06:20', state: 'Arrive', active: false },
];

export default function Home() {
  return (
    <main>
      <section className="hero-shell" id="top">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />

        <nav className="nav-wrap" aria-label="Primary navigation">
          <a className="brand" href="#top" aria-label="RailSetu home">
            <span className="brand-mark" aria-hidden="true"><i /><i /></span>
            <BrandTextType />
          </a>
          <div className="nav-links">
            <a href="#why">Why RailSetu</a>
            <a href="#how">How it works</a>
          </div>
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

        <div className="hero-copy">
          <div className="eyebrow"><span /> A precise way through the waitlist</div>
          <h1>
            One train.<br />
            <span className="soft-word">A better way</span> through.
          </h1>
          <p>
            RailSetu finds confirmed segments on the same train and turns them
            into one clear, comfortable journey—built around the traveller.
          </p>
          <div className="hero-actions">
            <TactileGlareLink
              className="primary-btn"
              href="#preview"
              baseColor="#0b1229"
              depth={8}
            >
              Find my route <span>→</span>
            </TactileGlareLink>
            <a className="text-link" href="#how"><span className="play">▶</span><span className="shiny-text">See how it works</span></a>
          </div>
        </div>

        <div className="product-stage" id="preview" aria-label="RailSetu journey preview">
          <div className="stage-glow" />
          <div className="status-pill status-left"><span>WL 46</span><small>Direct journey</small></div>
          <div className="status-pill status-right"><span>92%</span><small>Journey comfort</small></div>

          <div className="journey-card">
            <div className="card-topline">
              <div>
                <span className="mini-label">Your best route</span>
                <h2>Pune <span>→</span> Hyderabad</h2>
              </div>
              <span className="confirmed"><i /> Confirmed throughout</span>
            </div>

            <div className="traveller-mode">
              <span className="mode-icon" aria-hidden="true">✦</span>
              <div><small>Planned for</small><strong>Elderly traveller</strong></div>
              <span className="mode-tag">No coach changes</span>
            </div>

            <div className="route-line">
              {journeyStops.map((stop, index) => (
                <div className="stop" key={stop.code}>
                  <div className={`stop-dot ${stop.active ? 'active' : ''}`}>
                    {index === 1 ? <span className="seat-pop">B2 · 34 → 41</span> : null}
                  </div>
                  <strong>{stop.code}</strong>
                  <small>{stop.time}</small>
                  <em>{stop.state}</em>
                </div>
              ))}
            </div>

            <div className="card-footer">
              <div className="metric"><small>Changes</small><strong>1 seat · same coach</strong></div>
              <div className="metric"><small>Total fare</small><strong>₹1,420</strong></div>
              <TactileGlareLink
                className="choose-journey"
                wrapperClassName="choose-journey-wrap"
                href="#how"
                baseColor="#28429a"
                depth={6}
                glareOpacity={0.28}
              >
                Choose journey <span>→</span>
              </TactileGlareLink>
            </div>
          </div>

          <div className="floating-note note-one"><span>01</span> Same train</div>
          <div className="floating-note note-two"><span>02</span> Safer transitions</div>
        </div>

        <div className="hero-footnote">
          <span>Independent civic-tech prototype</span>
          <span className="scroll-cue">Scroll to discover <i>↓</i></span>
          <span>Made for Indian journeys</span>
        </div>
      </section>

      <section className="why-section" id="why">
        <p className="section-kicker">The missing connection</p>
        <h2>A waitlist shouldn&apos;t be<br />the end of the journey.</h2>
        <p className="section-copy">
          Seats often exist across different parts of the same route. RailSetu
          connects them, then filters every option through the needs of the
          person actually travelling.
        </p>
        <div className="principles" id="how">
          <article><span>01</span><h3>Find the path</h3><p>We look across the complete train route for confirmed, continuous segments.</p></article>
          <article><span>02</span><h3>Respect the traveller</h3><p>Mobility, family, luggage and time preferences become real constraints.</p></article>
          <article><span>03</span><h3>Make it one journey</h3><p>Multiple reservations become one calm itinerary that is easy to follow.</p></article>
        </div>
      </section>
    </main>
  );
}
