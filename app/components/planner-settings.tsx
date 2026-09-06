'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import PassengerProfile from './passenger-profile';
import JourneyHistory from './journey-history';
import RailSetuWallet from './railsetu-wallet';
import TransactionHistory from './transaction-history';
import { useSiteLanguage } from './site-language';
import { HandCoinsIcon, LogInIcon, SlidersHorizontalIcon, WalletIcon } from './ui/animated-icons';

type SiteTheme = 'light' | 'dark';

const Auth10 = dynamic(() => import('./ui/auth-10'), { ssr: false });

const THEME_STORAGE_KEY = 'railsetu.theme.v1';
const LEGACY_THEME_STORAGE_KEY = 'railsetu.planner-theme.v1';
const THEME_CHANGE_EVENT = 'railsetu:theme-change';
const CURSOR_STORAGE_KEY = 'railsetu.cursor-skin.v1';
const CALENDAR_STORAGE_KEY = 'railsetu.mock-calendar.v1';
const CURSOR_CHANGE_EVENT = 'railsetu:cursor-change';
const SETTINGS_CHANGE_EVENT = 'railsetu:more-settings-change';
let sessionTheme: SiteTheme = 'light';

function readTheme(): SiteTheme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') sessionTheme = stored;
  } catch {
    // Keep the current session theme when device storage is unavailable.
  }
  return sessionTheme;
}

function subscribeToTheme(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === LEGACY_THEME_STORAGE_KEY) onStoreChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
  };
}

function applyTheme(theme: SiteTheme) {
  document.documentElement.classList.toggle('railsetu-dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

function readLocalToggle(key: string, defaultValue: boolean) {
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? defaultValue : stored === 'on';
  } catch {
    return defaultValue;
  }
}

function subscribeToMoreSettings(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === CURSOR_STORAGE_KEY || event.key === CALENDAR_STORAGE_KEY) onStoreChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(SETTINGS_CHANGE_EVENT, onStoreChange);
  window.addEventListener(CURSOR_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(SETTINGS_CHANGE_EVENT, onStoreChange);
    window.removeEventListener(CURSOR_CHANGE_EVENT, onStoreChange);
  };
}

function UserSettingsIcon() {
  return (
    <svg className="planner-settings-user-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path className="planner-settings-user-body" d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" pathLength="1" />
      <circle className="planner-settings-user-head" cx="12" cy="7" r="4" />
    </svg>
  );
}

function HistorySettingsIcon() {
  return (
    <svg className="planner-settings-history-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path className="planner-settings-history-arc" d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" pathLength="1" />
      <path className="planner-settings-history-arc" d="M3 3v5h5" pathLength="1" />
      <path className="planner-settings-history-hand" d="M12 7v5l4 2" />
    </svg>
  );
}

function LanguageSettingsIcon() {
  return (
    <svg className="planner-settings-language-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle className="planner-settings-language-outline" cx="12" cy="12" r="9" />
      <path className="planner-settings-language-orbits" d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
    </svg>
  );
}

export default function SiteSettings() {
  const { language, setLanguage } = useSiteLanguage();
  const [open, setOpen] = useState(false);
  const theme = useSyncExternalStore(subscribeToTheme, readTheme, () => 'light');
  const [profileOpen, setProfileOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [transactionsOpen, setTransactionsOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [animatedTile, setAnimatedTile] = useState<'wallet' | 'transactions' | 'more' | 'login' | null>(null);
  const moreSettingsSnapshot = useSyncExternalStore(
    subscribeToMoreSettings,
    () => `${readLocalToggle(CURSOR_STORAGE_KEY, true)}:${readLocalToggle(CALENDAR_STORAGE_KEY, false)}`,
    () => 'true:false',
  );
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    applyTheme(readTheme());
  }, [theme]);

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
    sessionTheme = nextTheme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // The selected theme still applies for this session when storage is unavailable.
    }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  };

  const isDark = theme === 'dark';
  const [cursorSnapshot, calendarSnapshot] = moreSettingsSnapshot.split(':');
  const cursorEnabled = cursorSnapshot === 'true';
  const calendarLinked = calendarSnapshot === 'true';

  const updateLocalToggle = (key: string, enabled: boolean, eventName = SETTINGS_CHANGE_EVENT) => {
    try {
      window.localStorage.setItem(key, enabled ? 'on' : 'off');
    } catch {
      // Keep the control usable during this visit if device storage is unavailable.
    }
    window.dispatchEvent(new Event(eventName));
  };

  return (
    <div className={`planner-settings ${open ? 'is-open' : ''}`} ref={root}>
      <button
        className="planner-settings-trigger"
        type="button"
        aria-label="Open RailSetu settings"
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
        <section className="planner-settings-panel" id="site-settings-panel" aria-label="Settings">
          <div className="planner-settings-heading">
            <strong>Settings</strong>
            <button type="button" aria-label="Close settings" onClick={() => setOpen(false)}>×</button>
          </div>

          <div className="planner-settings-options">
            <button
              className="planner-settings-option"
              type="button"
              aria-haspopup="dialog"
              onClick={() => { setOpen(false); setProfileOpen(true); }}
            >
              <span className="planner-settings-option-icon"><UserSettingsIcon /></span>
              <span className="planner-settings-option-copy"><strong>Profile</strong><small>Traveller preferences</small></span>
              <span className="planner-settings-option-arrow" aria-hidden="true">›</span>
            </button>
            <button
              className="planner-settings-option"
              type="button"
              aria-haspopup="dialog"
              onClick={() => { setOpen(false); setHistoryOpen(true); }}
            >
              <span className="planner-settings-option-icon"><HistorySettingsIcon /></span>
              <span className="planner-settings-option-copy"><strong>History</strong><small>Past journeys</small></span>
              <span className="planner-settings-option-arrow" aria-hidden="true">›</span>
            </button>
            <button
              className="planner-settings-option"
              type="button"
              aria-haspopup="dialog"
              onPointerEnter={() => setAnimatedTile('wallet')}
              onPointerLeave={() => setAnimatedTile(null)}
              onFocus={() => setAnimatedTile('wallet')}
              onBlur={() => setAnimatedTile(null)}
              onClick={() => { setOpen(false); setWalletOpen(true); }}
            >
              <span className="planner-settings-option-icon"><WalletIcon active={animatedTile === 'wallet'} /></span>
              <span className="planner-settings-option-copy"><strong>Wallet</strong><small>Refunds and balance</small></span>
              <span className="planner-settings-option-arrow" aria-hidden="true">›</span>
            </button>
            <button
              className="planner-settings-option"
              type="button"
              aria-haspopup="dialog"
              onPointerEnter={() => setAnimatedTile('transactions')}
              onPointerLeave={() => setAnimatedTile(null)}
              onFocus={() => setAnimatedTile('transactions')}
              onBlur={() => setAnimatedTile(null)}
              onClick={() => { setOpen(false); setTransactionsOpen(true); }}
            >
              <span className="planner-settings-option-icon"><HandCoinsIcon active={animatedTile === 'transactions'} /></span>
              <span className="planner-settings-option-copy"><strong>Transaction History</strong><small>Payments, refunds and receipts</small></span>
              <span className="planner-settings-option-arrow" aria-hidden="true">›</span>
            </button>
            <div className="planner-language-option">
              <span className="planner-settings-option-icon"><LanguageSettingsIcon /></span>
              <span className="planner-settings-option-copy"><strong>Website language</strong><small>English or Hindi</small></span>
              <button
                className={`planner-language-switch ${language === 'hi' ? 'is-hindi' : ''}`}
                type="button"
                role="switch"
                aria-checked={language === 'hi'}
                aria-label={language === 'en' ? 'Switch website language to Hindi' : 'Switch website language to English'}
                onClick={() => setLanguage(language === 'en' ? 'hi' : 'en')}
              >
                <span className={language === 'en' ? 'is-active' : ''}>EN</span>
                <span className={language === 'hi' ? 'is-active' : ''}>हिं</span>
                <i aria-hidden="true" />
              </button>
            </div>
            <button
              className={`planner-settings-option planner-more-options-trigger ${moreOpen ? 'is-active' : ''}`}
              type="button"
              aria-expanded={moreOpen}
              aria-controls="railsetu-more-options"
              onPointerEnter={() => setAnimatedTile('more')}
              onPointerLeave={() => setAnimatedTile(null)}
              onFocus={() => setAnimatedTile('more')}
              onBlur={() => setAnimatedTile(null)}
              onClick={() => setMoreOpen((current) => !current)}
            >
              <span className="planner-settings-option-icon"><SlidersHorizontalIcon active={animatedTile === 'more'} /></span>
              <span className="planner-settings-option-copy"><strong>More options</strong><small>Cursor and calendar</small></span>
              <span className="planner-settings-option-arrow" aria-hidden="true">›</span>
            </button>
            {moreOpen ? (
              <div className="planner-more-options" id="railsetu-more-options">
                <div className="planner-more-option-row">
                  <span><strong>Cursor skin</strong><small>Use the RailSetu pointer effect</small></span>
                  <button
                    className={`planner-mini-switch ${cursorEnabled ? 'is-on' : ''}`}
                    type="button"
                    role="switch"
                    aria-checked={cursorEnabled}
                    aria-label={cursorEnabled ? 'Disable cursor skin' : 'Enable cursor skin'}
                    onClick={() => updateLocalToggle(CURSOR_STORAGE_KEY, !cursorEnabled, CURSOR_CHANGE_EVENT)}
                  ><i aria-hidden="true" /></button>
                </div>
                <div className="planner-more-option-row planner-calendar-row">
                  <span><strong>Google Calendar</strong><small>Demo connection—no account data is requested</small></span>
                  <button
                    className={`planner-calendar-mock ${calendarLinked ? 'is-linked' : ''}`}
                    type="button"
                    aria-pressed={calendarLinked}
                    onClick={() => updateLocalToggle(CALENDAR_STORAGE_KEY, !calendarLinked)}
                  >{calendarLinked ? 'Mock linked ✓' : 'Link mock'}</button>
                </div>
              </div>
            ) : null}
            <button
              className="planner-settings-option planner-login-option"
              type="button"
              aria-haspopup="dialog"
              onPointerEnter={() => setAnimatedTile('login')}
              onPointerLeave={() => setAnimatedTile(null)}
              onFocus={() => setAnimatedTile('login')}
              onBlur={() => setAnimatedTile(null)}
              onClick={() => { setOpen(false); setAuthOpen(true); }}
            >
              <span className="planner-settings-option-icon"><LogInIcon active={animatedTile === 'login'} /></span>
              <span className="planner-settings-option-copy"><strong>Login / Sign up</strong><small>Prototype passenger account</small></span>
              <span className="planner-settings-option-arrow" aria-hidden="true">›</span>
            </button>
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
      <PassengerProfile isOpen={profileOpen} onClose={() => setProfileOpen(false)} />
      <JourneyHistory isOpen={historyOpen} onClose={() => setHistoryOpen(false)} />
      <RailSetuWallet isOpen={walletOpen} onClose={() => setWalletOpen(false)} />
      <TransactionHistory isOpen={transactionsOpen} onClose={() => setTransactionsOpen(false)} />
      <Auth10 open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
