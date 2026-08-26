'use client';

import { useEffect, useRef } from 'react';
import type { MouseEventHandler } from 'react';
import TactileGlareLink from './tactile-glare-link';

const CUE_DELAY_MS = 500;
const CUE_DURATION_MS = 3900;

export default function ChooseJourneyCueLink() {
  const startTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCue = () => {
    if (startTimer.current) clearTimeout(startTimer.current);
    if (endTimer.current) clearTimeout(endTimer.current);
    startTimer.current = null;
    endTimer.current = null;
  };

  useEffect(() => {
    return () => {
      clearCue();
      document.getElementById('top')?.classList.remove('route-cta-active');
    };
  }, []);

  const handleClick: MouseEventHandler<HTMLAnchorElement> = event => {
    event.preventDefault();
    clearCue();

    const hero = document.getElementById('top');
    if (!hero) return;

    hero.classList.remove('route-cta-active');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    hero.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    window.history.replaceState(null, '', '#top');

    startTimer.current = setTimeout(() => {
      hero.classList.remove('route-cta-active');
      void hero.offsetWidth;
      hero.classList.add('route-cta-active');

      endTimer.current = setTimeout(() => {
        hero.classList.remove('route-cta-active');
      }, CUE_DURATION_MS);
    }, reducedMotion ? 0 : CUE_DELAY_MS);
  };

  return (
    <TactileGlareLink
      className="choose-journey"
      wrapperClassName="choose-journey-wrap"
      href="#top"
      baseColor="#28429a"
      depth={6}
      glareOpacity={0.28}
      onClick={handleClick}
    >
      Choose journey <span>→</span>
    </TactileGlareLink>
  );
}
