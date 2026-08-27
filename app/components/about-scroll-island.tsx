'use client';

import { createPortal } from 'react-dom';
import { useEffect, useState, type CSSProperties } from 'react';

export type AboutScrollTopic = {
  id: string;
  title: string;
};

export default function AboutScrollIsland({ topics }: { topics: AboutScrollTopic[] }) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setMounted(true);

    const updateProgress = () => {
      const maximum = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(maximum > 0 ? Math.min(100, Math.max(0, (window.scrollY / maximum) * 100)) : 0);
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);
    document.addEventListener('keydown', closeFromKeyboard);
    return () => {
      window.removeEventListener('scroll', updateProgress);
      window.removeEventListener('resize', updateProgress);
      document.removeEventListener('keydown', closeFromKeyboard);
    };
  }, []);

  const visitTopic = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.remove('is-scroll-island-active');
    requestAnimationFrame(() => target.classList.add('is-scroll-island-active'));
    window.setTimeout(() => target.classList.remove('is-scroll-island-active'), 1800);
    setOpen(false);
  };

  if (!mounted) return null;

  return createPortal(
    <>
      {open ? <button className="about-scroll-island-backdrop" type="button" aria-label="Close page index" onClick={() => setOpen(false)} /> : null}
      <aside className={`about-scroll-island ${open ? 'is-open' : ''}`} aria-label="About page index">
        <button
          className="about-scroll-island-trigger"
          type="button"
          aria-expanded={open}
          aria-controls="about-scroll-island-topics"
          onClick={() => setOpen((current) => !current)}
        >
          <span
            className="about-scroll-island-progress"
            style={{ '--scroll-progress': `${progress}%` } as CSSProperties}
            aria-hidden="true"
          ><i /></span>
          <strong>Index</strong>
          <span className="about-scroll-island-chevron" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
          <b>{Math.round(progress)}%</b>
        </button>

        <div className="about-scroll-island-topics" id="about-scroll-island-topics">
          <span aria-hidden="true" />
          {topics.map((topic) => (
            <button key={topic.id} type="button" onClick={() => visitTopic(topic.id)}>
              {topic.title}
            </button>
          ))}
        </div>
      </aside>
    </>,
    document.body,
  );
}
