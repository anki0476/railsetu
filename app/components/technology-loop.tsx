'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

type Technology = {
  category: 'Language' | 'Framework' | 'Library' | 'Tool' | 'Platform';
  name: string;
  version?: string;
};

const technologies: Technology[] = [
  { category: 'Language', name: 'TypeScript', version: '5.9' },
  { category: 'Language', name: 'JavaScript', version: 'ES2024' },
  { category: 'Language', name: 'TSX + JSX' },
  { category: 'Language', name: 'CSS' },
  { category: 'Framework', name: 'React', version: '19.2' },
  { category: 'Framework', name: 'Next.js', version: '16.2' },
  { category: 'Framework', name: 'Vinext', version: '1.0 beta' },
  { category: 'Library', name: 'React DOM', version: '19.2' },
  { category: 'Library', name: 'QRCode React', version: '4.2' },
  { category: 'Library', name: 'Paper Design Shaders', version: '0.0.80' },
  { category: 'Library', name: 'React Server DOM', version: '19.2' },
  { category: 'Library', name: 'Cloudflare Workers Types', version: '2026.05' },
  { category: 'Library', name: 'React Types', version: '19.2' },
  { category: 'Library', name: 'Node Types', version: '22.19' },
  { category: 'Tool', name: 'Vite', version: '8.0' },
  { category: 'Tool', name: 'Tailwind CSS', version: '4.2' },
  { category: 'Tool', name: 'Tailwind PostCSS', version: '4.2' },
  { category: 'Tool', name: 'Vite React plugin', version: '6.0' },
  { category: 'Tool', name: 'Vite RSC plugin', version: '0.5' },
  { category: 'Tool', name: 'Cloudflare Vite plugin', version: '1.37' },
  { category: 'Tool', name: 'OpenAI Sites plugin', version: '0.1+' },
  { category: 'Tool', name: 'TypeScript compiler' },
  { category: 'Tool', name: 'ESLint', version: '9.39' },
  { category: 'Tool', name: 'Next.js ESLint config', version: '16.2' },
  { category: 'Tool', name: 'Lightning CSS', version: '1.33' },
  { category: 'Tool', name: 'Wrangler', version: '4.92' },
  { category: 'Tool', name: 'npm' },
  { category: 'Tool', name: 'Git' },
  { category: 'Tool', name: 'OpenAI Codex' },
  { category: 'Platform', name: 'Node.js', version: '22+' },
  { category: 'Platform', name: 'Cloudflare Workers' },
  { category: 'Platform', name: 'OpenAI Sites' },
];

const GAP = 16;
const SPEED = 42;

export default function TechnologyLoop() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const sequenceRef = useRef<HTMLUListElement>(null);
  const offsetRef = useRef(0);
  const lastFrameRef = useRef<number | null>(null);
  const [sequenceWidth, setSequenceWidth] = useState(0);
  const [copyCount, setCopyCount] = useState(2);
  const [isPaused, setIsPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const measure = useCallback(() => {
    const viewportWidth = viewportRef.current?.clientWidth ?? 0;
    const width = sequenceRef.current?.getBoundingClientRect().width ?? 0;
    if (width <= 0) return;
    const roundedWidth = Math.ceil(width);
    setSequenceWidth(roundedWidth);
    setCopyCount(Math.max(2, Math.ceil(viewportWidth / roundedWidth) + 2));
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(media.matches);
    updatePreference();
    media.addEventListener('change', updatePreference);
    return () => media.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    measure();
    if (!viewportRef.current || !sequenceRef.current) return;
    const observer = new ResizeObserver(measure);
    observer.observe(viewportRef.current);
    observer.observe(sequenceRef.current);
    return () => observer.disconnect();
  }, [measure]);

  useEffect(() => {
    if (reducedMotion || sequenceWidth <= 0) {
      if (trackRef.current) trackRef.current.style.transform = 'translate3d(0,0,0)';
      return;
    }

    let frame = 0;
    const animate = (timestamp: number) => {
      if (lastFrameRef.current === null) lastFrameRef.current = timestamp;
      const delta = Math.min(0.05, (timestamp - lastFrameRef.current) / 1000);
      lastFrameRef.current = timestamp;
      if (!isPaused) offsetRef.current = (offsetRef.current + SPEED * delta) % sequenceWidth;
      if (trackRef.current) {
        trackRef.current.style.transform = `translate3d(${-offsetRef.current}px,0,0)`;
      }
      frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    return () => {
      window.cancelAnimationFrame(frame);
      lastFrameRef.current = null;
    };
  }, [isPaused, reducedMotion, sequenceWidth]);

  const copies = useMemo(
    () => Array.from({ length: copyCount }, (_, copyIndex) => (
      <ul
        className="technology-loop-list"
        key={copyIndex}
        ref={copyIndex === 0 ? sequenceRef : undefined}
        aria-hidden={copyIndex > 0}
      >
        {technologies.map(({ category, name, version }) => (
          <li className="technology-chip" key={`${copyIndex}-${category}-${name}`}>
            <span>{category}</span>
            <strong>{name}</strong>
            {version && <small>{version}</small>}
          </li>
        ))}
      </ul>
    )),
    [copyCount],
  );

  return (
    <div
      className="technology-loop"
      ref={viewportRef}
      role="region"
      aria-label="RailSetu technology stack"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      style={{ '--technology-loop-gap': `${GAP}px` } as CSSProperties}
    >
      <div className="technology-loop-track" ref={trackRef}>{copies}</div>
    </div>
  );
}
