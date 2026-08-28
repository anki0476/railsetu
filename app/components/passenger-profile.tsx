'use client';

import { useEffect, useRef, useState } from 'react';

export interface PassengerProfileData {
  fullName: string;
  email: string;
  aadhaarNumber: string;
  contactNumber: string;
  lastUpdated: string;
}

interface PassengerProfileProps {
  isOpen: boolean;
  onClose: () => void;
}

const PROFILE_STORAGE_KEY = 'railsetu.passenger-profile.v1';
const defaultProfile: PassengerProfileData = {
  fullName: 'Mock Name',
  email: 'mock.passenger@example.com',
  aadhaarNumber: 'XXXX XXXX 1234',
  contactNumber: '+91 90000 00000',
  lastUpdated: 'Not saved yet',
};

type SaveStatus = 'idle' | 'loading' | 'success' | 'saved';

function EditIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
    </svg>
  );
}

function ProfileAvatar() {
  return (
    <div className="passenger-profile-avatar" aria-hidden="true">
      <span>MN</span>
      <i /><i />
    </div>
  );
}

export default function PassengerProfile({ isOpen, onClose }: PassengerProfileProps) {
  const [profile, setProfile] = useState<PassengerProfileData>(defaultProfile);
  const [draft, setDraft] = useState<PassengerProfileData>(defaultProfile);
  const [editing, setEditing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const saveTimers = useRef<number[]>([]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PROFILE_STORAGE_KEY);
      if (saved) {
        const parsed = { ...defaultProfile, ...JSON.parse(saved) } as PassengerProfileData;
        setProfile(parsed);
        setDraft(parsed);
      }
    } catch {
      // Keep the safe mock profile when device storage is unavailable.
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(profile);
    setEditing(false);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  useEffect(() => () => saveTimers.current.forEach(window.clearTimeout), []);

  if (!isOpen) return null;

  const updateDraft = (field: keyof PassengerProfileData, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const persistProfile = () => {
    const savedProfile = {
      ...draft,
      fullName: draft.fullName.trim() || defaultProfile.fullName,
      lastUpdated: new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date()),
    };
    setProfile(savedProfile);
    setDraft(savedProfile);
    try {
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(savedProfile));
    } catch {
      // The profile remains available for this session when storage is unavailable.
    }
  };

  const saveProfile = () => {
    if (saveStatus !== 'idle') return;
    setSaveStatus('loading');
    saveTimers.current.push(window.setTimeout(() => {
      persistProfile();
      setSaveStatus('success');
      saveTimers.current.push(window.setTimeout(() => {
        setSaveStatus('saved');
        saveTimers.current.push(window.setTimeout(() => {
          setEditing(false);
          setSaveStatus('idle');
        }, 650));
      }, 550));
    }, 700));
  };

  return (
    <div className="passenger-profile-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      {!editing ? (
        <section className="passenger-profile-card" role="dialog" aria-modal="true" aria-labelledby="passenger-profile-title">
          <button className="passenger-profile-close" type="button" aria-label="Close profile" onClick={onClose}>×</button>
          <ProfileAvatar />
          <h2 id="passenger-profile-title">{profile.fullName}</h2>
          <p>Passenger</p>
          <div className="passenger-profile-summary">
            <span>{profile.email}</span>
            <span>{profile.contactNumber}</span>
          </div>
          <button className="passenger-profile-edit" type="button" onClick={() => setEditing(true)}>
            <EditIcon /> Edit profile
          </button>
        </section>
      ) : (
        <section className="passenger-profile-editor" role="dialog" aria-modal="true" aria-labelledby="passenger-editor-title">
          <header>
            <h2 id="passenger-editor-title">Edit your profile</h2>
            <button type="button" aria-label="Close profile editor" onClick={onClose}>×</button>
          </header>
          <div className="passenger-profile-editor-body">
            <form onSubmit={(event) => { event.preventDefault(); saveProfile(); }}>
              <label>
                <span>Full name</span>
                <input value={draft.fullName} onChange={(event) => updateDraft('fullName', event.target.value)} autoComplete="name" />
              </label>
              <label>
                <span>Email</span>
                <input type="email" value={draft.email} onChange={(event) => updateDraft('email', event.target.value)} autoComplete="email" />
              </label>
              <label>
                <span>Aadhaar number</span>
                <input value={draft.aadhaarNumber} onChange={(event) => updateDraft('aadhaarNumber', event.target.value)} inputMode="numeric" aria-describedby="aadhaar-storage-note" />
                <small id="aadhaar-storage-note">Prototype field. Stored only on this device.</small>
              </label>
              <label>
                <span>Contact number</span>
                <input type="tel" value={draft.contactNumber} onChange={(event) => updateDraft('contactNumber', event.target.value)} autoComplete="tel" />
              </label>
            </form>
            <aside aria-label="Profile preview">
              <span>Preview</span>
              <ProfileAvatar />
              <h3>{draft.fullName || defaultProfile.fullName}</h3>
              <p>Passenger</p>
              <dl>
                <div><dt>Aadhaar</dt><dd>{draft.aadhaarNumber || 'Not added'}</dd></div>
                <div><dt>Contact</dt><dd>{draft.contactNumber || 'Not added'}</dd></div>
              </dl>
            </aside>
          </div>
          <footer>
            <span>Last updated: <strong>{profile.lastUpdated}</strong></span>
            <div>
              <button type="button" onClick={() => { setDraft(profile); setEditing(false); }}>Cancel</button>
              <button type="button" className={`passenger-profile-save-toggle is-${saveStatus}`} onClick={saveProfile} disabled={saveStatus !== 'idle'} aria-live="polite">
                {saveStatus === 'loading' && <span className="passenger-profile-save-spinner" aria-hidden="true" />}
                {saveStatus === 'success' && <span className="passenger-profile-save-check" aria-hidden="true">✓</span>}
                {saveStatus === 'saved' && <><span className="passenger-profile-save-check" aria-hidden="true">✓</span><span>Saved</span></>}
                {saveStatus === 'idle' && <span>Save changes</span>}
              </button>
            </div>
          </footer>
        </section>
      )}
    </div>
  );
}
