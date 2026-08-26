'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const prepareSequence = [
  { id: 'wheels', label: 'Spinning the train wheels' },
  { id: 'ideas', label: 'Ideating the routes' },
  { id: 'routes', label: 'Loading the routes' },
] as const;

function PinwheelIcon() {
  return (
    <svg className="prepare-pinwheel-icon" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g className="prepare-pinwheel">
        <path d="M22 12a1 1 0 0 1-10 0 1 1 0 0 0-10 0" />
        <path d="M7 20.7a1 1 0 1 1 5-8.7 1 1 0 1 0 5-8.6" />
        <path d="M7 3.3a1 1 0 1 1 5 8.6 1 1 0 1 0 5 8.6" />
      </g>
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function LightbulbIcon() {
  return (
    <svg className="prepare-lightbulb-icon" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" className="prepare-bulb-path-one" />
      <path d="M9 18h6" className="prepare-bulb-path-two" />
      <path d="M10 22h4" />
    </svg>
  );
}

function RouteIcon() {
  return (
    <svg className="prepare-route-icon" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="19" r="3" className="prepare-route-circle" />
      <circle cx="18" cy="5" r="3" className="prepare-route-circle" />
      <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" className="prepare-route-line" />
    </svg>
  );
}

export default function PrepareJourneyPage() {
  const router = useRouter();
  const [phaseIndex, setPhaseIndex] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    router.prefetch('/planner');
    const plannerReady = window.fetch('/planner', { cache: 'force-cache', signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Planner preload failed');
      })
      .catch(() => undefined);
    const cycleTimer = window.setInterval(() => setPhaseIndex((current) => (current + 1) % prepareSequence.length), 1200);
    const navigateTimer = window.setTimeout(async () => {
      await plannerReady;
      if (active) router.replace('/planner');
    }, 3600);

    return () => {
      active = false;
      controller.abort();
      window.clearInterval(cycleTimer);
      window.clearTimeout(navigateTimer);
    };
  }, [router]);

  const phase = prepareSequence[phaseIndex];

  return (
    <main className={`prepare-page is-${phase.id}`} aria-live="polite" aria-label="Preparing the RailSetu journey planner">
      <span className="prepare-ambient prepare-ambient-one" aria-hidden="true" />
      <span className="prepare-ambient prepare-ambient-two" aria-hidden="true" />
      <section className="prepare-content">
        <div className="prepare-icon-stage" key={phase.id}>
          {phase.id === 'wheels' ? <PinwheelIcon /> : phase.id === 'ideas' ? <LightbulbIcon /> : <RouteIcon />}
        </div>
        <h1 className="prepare-shimmer-text">{phase.label}</h1>
      </section>
    </main>
  );
}
