'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';

type ClickBurst = {
  id: number;
  x: number;
  y: number;
};

const ARROW_PATH = 'M0,0 L18,11 L9,13 L6,21 Z';
const ARROW_REST = Math.atan2(-15, -12);
const BURST_LINES = [0, 1, 2, 3];
const BURST_PARTICLES = [0, 1, 2, 3, 4, 5, 6, 7];

function shortestAngle(from: number, to: number) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

export default function GlobalInteractionEffects() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const [bursts, setBursts] = useState<ClickBurst[]>([]);
  const nextId = useRef(0);
  const timeoutIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    const cursor = cursorRef.current;
    const canUseCursor = window.matchMedia('(pointer: fine)').matches;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!cursor || !canUseCursor || reduceMotion) return;

    document.documentElement.classList.add('railsetu-cursor-enabled');

    let targetX = -100;
    let targetY = -100;
    let currentX = targetX;
    let currentY = targetY;
    let angle = 0;
    let visible = false;
    let pressed = false;
    let frameId = 0;

    const onMove = (event: PointerEvent) => {
      targetX = event.clientX;
      targetY = event.clientY;
      visible = true;
    };

    const onLeave = () => {
      visible = false;
    };

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      pressed = true;
      const id = nextId.current++;
      setBursts((current) => [...current.slice(-4), { id, x: event.clientX, y: event.clientY }]);
      const timeoutId = window.setTimeout(() => {
        setBursts((current) => current.filter((burst) => burst.id !== id));
        timeoutIds.current.delete(timeoutId);
      }, 680);
      timeoutIds.current.add(timeoutId);
    };

    const onUp = () => {
      pressed = false;
    };

    const animate = () => {
      const previousX = currentX;
      const previousY = currentY;
      currentX += (targetX - currentX) * 0.24;
      currentY += (targetY - currentY) * 0.24;

      const dx = currentX - previousX;
      const dy = currentY - previousY;
      const speed = Math.hypot(dx, dy);
      if (speed > 0.3) {
        const targetAngle = Math.atan2(dy, dx) - ARROW_REST;
        angle += shortestAngle(angle, targetAngle) * 0.2;
      }

      const stretch = 1 + Math.min(speed / 28, 0.28);
      const pressScale = pressed ? 0.78 : 1;
      cursor.style.opacity = visible ? '1' : '0';
      cursor.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) rotate(${angle}rad) scale(${pressScale / Math.sqrt(stretch)}, ${pressScale * stretch})`;
      frameId = requestAnimationFrame(animate);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      timeoutIds.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timeoutIds.current.clear();
      document.documentElement.classList.remove('railsetu-cursor-enabled');
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  return (
    <div className="interaction-layer" aria-hidden="true">
      <div className="spin-cursor" ref={cursorRef}>
        <svg width="18" height="21" viewBox="0 0 18 21">
          <path d={ARROW_PATH} />
        </svg>
      </div>

      {bursts.map((burst) => (
        <div
          className="click-burst"
          key={burst.id}
          style={{ left: burst.x, top: burst.y }}
        >
          <span className="burst-ring" />
          {BURST_LINES.map((line) => (
            <span className={`burst-line burst-line-${line}`} key={line} />
          ))}
          {BURST_PARTICLES.map((particle) => (
            <span
              className="burst-particle"
              key={particle}
              style={{ '--burst-angle': `${particle * 45}deg` } as CSSProperties}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
