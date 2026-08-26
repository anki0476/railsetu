'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type PreparePhase = 'wheels' | 'routes';

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

export default function PrepareJourneyPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<PreparePhase>('wheels');

  useEffect(() => {
    router.prefetch('/planner');
    const routeTimer = window.setTimeout(() => setPhase('routes'), 1500);
    const navigateTimer = window.setTimeout(() => router.replace('/planner'), 3200);

    return () => {
      window.clearTimeout(routeTimer);
      window.clearTimeout(navigateTimer);
    };
  }, [router]);

  const showingWheels = phase === 'wheels';

  return (
    <main className={`prepare-page is-${phase}`} aria-live="polite" aria-label="Preparing the RailSetu journey planner">
      <span className="prepare-ambient prepare-ambient-one" aria-hidden="true" />
      <span className="prepare-ambient prepare-ambient-two" aria-hidden="true" />
      <section className="prepare-content">
        <div className="prepare-icon-stage" key={showingWheels ? 'wheels' : 'routes'}>
          {showingWheels ? <PinwheelIcon /> : <LightbulbIcon />}
        </div>
        <h1 className="prepare-shimmer-text">
          {showingWheels ? 'Spinning the train wheels' : 'Ideating the routes'}
        </h1>
      </section>
    </main>
  );
}
