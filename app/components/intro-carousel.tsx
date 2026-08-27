'use client';

import { useCallback, useEffect, useState } from 'react';

const slides = [
  {
    eyebrow: 'Start with the person',
    title: 'Tell RailSetu where you need to go.',
    copy: 'Choose the journey, class and date, then add the traveller needs that should shape every result.',
    note: 'Mobility, luggage and berth preferences become real constraints.',
    visual: 'search',
  },
  {
    eyebrow: 'Look beyond the direct ticket',
    title: 'We read the entire train route.',
    copy: 'A direct waitlist can hide confirmed seats across different sections of the same train. RailSetu searches those sections together.',
    note: 'Same train. Continuous journey. No unnecessary interchange.',
    visual: 'scan',
  },
  {
    eyebrow: 'Connect the confirmed sections',
    title: 'One clear path, even when the seat changes.',
    copy: 'Each segment is joined into a single itinerary, with the change station, time, coach and seat made obvious before you choose.',
    note: 'Every colour represents one confirmed seat segment.',
    visual: 'route',
  },
  {
    eyebrow: 'Choose with confidence',
    title: 'Compare comfort, then carry one ticket.',
    copy: 'Review the comfort score, inspect the route, continue through checkout and keep the final journey available by QR and in History.',
    note: 'The prototype turns a fragmented booking into one calm experience.',
    visual: 'ticket',
  },
] as const;

function SlideVisual({ type }: { type: (typeof slides)[number]['visual'] }) {
  if (type === 'search') {
    return (
      <div className="intro-visual-card intro-search-card" aria-hidden="true">
        <div className="intro-field"><small>From</small><strong>New Delhi · NDLS</strong></div>
        <span className="intro-swap">⇄</span>
        <div className="intro-field"><small>To</small><strong>Patna Junction · PNBE</strong></div>
        <div className="intro-preference-row">
          <span>Elderly traveller</span><span>No coach changes</span><span>Lower berth</span>
        </div>
      </div>
    );
  }

  if (type === 'scan') {
    return (
      <div className="intro-visual-card intro-scan-card" aria-hidden="true">
        <div className="intro-direct-status"><small>Direct booking</small><strong>WL 46</strong></div>
        <div className="intro-scan-line"><i /><i /><i /><i /><i /></div>
        <div className="intro-scan-result"><span>2 confirmed sections found</span><b>✓</b></div>
      </div>
    );
  }

  if (type === 'route') {
    return (
      <div className="intro-visual-card intro-route-card" aria-hidden="true">
        <div className="intro-route-track"><span /><span /><span /></div>
        <div className="intro-route-stops">
          <div><strong>NDLS</strong><small>Board · B2/34</small></div>
          <div><strong>CNB</strong><small>Seat change</small></div>
          <div><strong>PNBE</strong><small>Arrive · B2/41</small></div>
        </div>
        <div className="intro-seat-change">B2 · 34 → 41</div>
      </div>
    );
  }

  return (
    <div className="intro-visual-card intro-ticket-card" aria-hidden="true">
      <div className="intro-ticket-top"><span>RailSetu</span><b>Confirmed throughout</b></div>
      <div className="intro-ticket-route"><strong>NDLS</strong><span>12310 · Magadh Express</span><strong>PNBE</strong></div>
      <div className="intro-ticket-meta"><span>Comfort <b>89</b></span><span>Total fare <b>₹1,440</b></span></div>
      <div className="intro-ticket-footer"><i>QR</i><span>One connected journey</span></div>
    </div>
  );
}

export default function IntroCarousel() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const goTo = useCallback((index: number) => {
    setActive((index + slides.length) % slides.length);
  }, []);

  useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % slides.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, [paused]);

  const slide = slides[active];

  return (
    <section
      className="intro-carousel-section"
      id="how-it-works"
      aria-labelledby="intro-carousel-title"
    >
      <div className="intro-carousel-heading">
        <p className="section-kicker">Your first journey with RailSetu</p>
        <h2 id="intro-carousel-title">From waitlist to<br /><span>one workable path.</span></h2>
        <p>Four clear steps. No railway jargon. See what RailSetu does before you plan.</p>
      </div>

      <div
        className="intro-carousel"
        role="region"
        aria-roledescription="carousel"
        aria-label="How RailSetu works"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
        }}
      >
        <div className="intro-carousel-topline">
          <span>0{active + 1} / 0{slides.length}</span>
          <div className="intro-carousel-progress" aria-hidden="true">
            <i key={active} className={paused ? 'is-paused' : ''} />
          </div>
          <span>{paused ? 'Paused' : 'Playing'}</span>
        </div>

        <article className="intro-slide" key={active} aria-live="polite">
          <div className="intro-slide-copy">
            <p className="intro-slide-eyebrow">{slide.eyebrow}</p>
            <h3>{slide.title}</h3>
            <p>{slide.copy}</p>
            <div className="intro-slide-note"><i>✦</i><span>{slide.note}</span></div>
          </div>
          <div className="intro-slide-visual">
            <SlideVisual type={slide.visual} />
          </div>
        </article>

        <div className="intro-carousel-controls">
          <div className="intro-carousel-dots" aria-label="Choose an introduction step">
            {slides.map((item, index) => (
              <button
                type="button"
                className={index === active ? 'is-active' : ''}
                onClick={() => goTo(index)}
                aria-label={`Show step ${index + 1}: ${item.eyebrow}`}
                aria-current={index === active ? 'step' : undefined}
                key={item.eyebrow}
              ><span>0{index + 1}</span></button>
            ))}
          </div>
          <div className="intro-carousel-arrows">
            <button type="button" onClick={() => goTo(active - 1)} aria-label="Previous step">←</button>
            <button type="button" onClick={() => goTo(active + 1)} aria-label="Next step">→</button>
          </div>
        </div>
      </div>
    </section>
  );
}
