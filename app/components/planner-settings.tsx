'use client';

import { useEffect, useRef, useState } from 'react';

type SiteTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'railsetu.theme.v1';
const LEGACY_THEME_STORAGE_KEY = 'railsetu.planner-theme.v1';

function applyTheme(theme: SiteTheme) {
  document.documentElement.classList.toggle('railsetu-dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

export default function SiteSettings() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<SiteTheme>('light');
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(THEME_STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    } catch {
      // Use the light default if device storage is unavailable.
    }
    const initialTheme: SiteTheme = stored === 'dark' ? 'dark' : 'light';
    setTheme(initialTheme);
    applyTheme(initialTheme);
    return () => {
      document.documentElement.classList.remove('railsetu-dark');
      document.documentElement.style.colorScheme = '';
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeFromOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeFromOutside);
    document.addEventListener('keydown', closeFromKeyboard);
    return () => {
      document.removeEventListener('pointerdown', closeFromOutside);
      document.removeEventListener('keydown', closeFromKeyboard);
    };
  }, [open]);

  const toggleTheme = () => {
    const nextTheme: SiteTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    applyTheme(nextTheme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // The selected theme still applies for this session when storage is unavailable.
    }
  };

  const isDark = theme === 'dark';

  return (
    <div className={`planner-settings ${open ? 'is-open' : ''}`} ref={root}>
      <button
        className="planner-settings-trigger"
        type="button"
        aria-label="Open RailSetu appearance settings"
        aria-expanded={open}
        aria-controls="site-settings-panel"
        onClick={() => setOpen((current) => !current)}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>

      {open ? (
        <section className="planner-settings-panel" id="site-settings-panel" aria-label="Appearance settings">
          <div className="planner-settings-heading">
            <div><span>Settings</span><strong>Appearance</strong></div>
            <button type="button" aria-label="Close settings" onClick={() => setOpen(false)}>×</button>
          </div>
          <div className="planner-theme-row">
            <div><strong>Colour theme</strong><small>{isDark ? 'Midnight rail' : 'Daylight blue'}</small></div>
            <button
              className={`planner-theme-switch ${isDark ? 'is-dark' : ''}`}
              type="button"
              role="switch"
              aria-checked={isDark}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              onClick={toggleTheme}
            >
              <span className="planner-theme-sun" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></svg>
              </span>
              <span className="planner-theme-moon" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 15.2A8 8 0 1 1 8.8 3.2a6.2 6.2 0 0 0 12 12Z" /></svg>
              </span>
              <i aria-hidden="true" />
            </button>
          </div>
          <p className="planner-theme-note">Applied across RailSetu and saved on this device.</p>
        </section>
      ) : null}
    </div>
  );
}
