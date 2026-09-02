'use client';

import { useEffect, useRef, useState } from 'react';

export interface PassengerProfileData {
  fullName: string;
  email: string;
  aadhaarNumber: string;
  contactNumber: string;
  lastUpdated: string;
}

interface LinkedPassenger {
  id: string;
  fullName: string;
  relation: string;
  aadhaarLast4: string;
  verified: boolean;
}

interface LinkedPassengerDraft {
  fullName: string;
  relation: string;
  mockAadhaar: string;
}

interface PassengerProfileProps {
  isOpen: boolean;
  onClose: () => void;
}

const PROFILE_STORAGE_KEY = 'railsetu.passenger-profile.v1';
const LINKED_PASSENGERS_STORAGE_KEY = 'railsetu.linked-passengers.v1';
const defaultProfile: PassengerProfileData = {
  fullName: 'Mock Name',
  email: 'mock.passenger@example.com',
  aadhaarNumber: 'XXXX XXXX 1234',
  contactNumber: '+91 90000 00000',
  lastUpdated: 'Not saved yet',
};

type SaveStatus = 'idle' | 'loading' | 'success' | 'saved';
type VerificationStatus = 'idle' | 'checking' | 'verified';
const emptyLinkedPassenger: LinkedPassengerDraft = { fullName: '', relation: 'Parent', mockAadhaar: 'XXXX XXXX 5678' };

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
  const [addingPassenger, setAddingPassenger] = useState(false);
  const [linkedPassengers, setLinkedPassengers] = useState<LinkedPassenger[]>([]);
  const [linkedPassengerDraft, setLinkedPassengerDraft] = useState<LinkedPassengerDraft>(emptyLinkedPassenger);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('idle');
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
      const savedPassengers = window.localStorage.getItem(LINKED_PASSENGERS_STORAGE_KEY);
      if (savedPassengers) {
        const parsedPassengers = JSON.parse(savedPassengers) as unknown;
        if (Array.isArray(parsedPassengers)) setLinkedPassengers(parsedPassengers as LinkedPassenger[]);
      }
    } catch {
      // Keep the safe mock profile when device storage is unavailable.
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(profile);
    setEditing(false);
    setAddingPassenger(false);
    setVerificationStatus('idle');
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

  const verifyMockAadhaar = () => {
    if (!linkedPassengerDraft.fullName.trim() || linkedPassengerDraft.mockAadhaar.replace(/\D/g, '').length < 4 || verificationStatus !== 'idle') return;
    setVerificationStatus('checking');
    saveTimers.current.push(window.setTimeout(() => setVerificationStatus('verified'), 900));
  };

  const addLinkedPassenger = () => {
    if (verificationStatus !== 'verified' || !linkedPassengerDraft.fullName.trim()) return;
    const nextPassenger: LinkedPassenger = {
      id: `passenger-${Date.now()}`,
      fullName: linkedPassengerDraft.fullName.trim(),
      relation: linkedPassengerDraft.relation,
      aadhaarLast4: linkedPassengerDraft.mockAadhaar.replace(/\D/g, '').slice(-4).padStart(4, '0'),
      verified: true,
    };
    const nextPassengers = [...linkedPassengers, nextPassenger];
    setLinkedPassengers(nextPassengers);
    try {
      window.localStorage.setItem(LINKED_PASSENGERS_STORAGE_KEY, JSON.stringify(nextPassengers));
    } catch {
      // Linked mock passengers remain available for this session when storage is unavailable.
    }
    setLinkedPassengerDraft(emptyLinkedPassenger);
    setVerificationStatus('idle');
    setAddingPassenger(false);
  };

  return (
    <div className="passenger-profile-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      {addingPassenger ? (
        <section className="passenger-linked-editor" role="dialog" aria-modal="true" aria-labelledby="linked-passenger-title">
          <header>
            <div><span>Additional traveller</span><h2 id="linked-passenger-title">Add a passenger</h2></div>
            <button type="button" aria-label="Return to profile" onClick={() => { setAddingPassenger(false); setVerificationStatus('idle'); }}>×</button>
          </header>
          <div className="passenger-linked-body">
            <form onSubmit={(event) => { event.preventDefault(); addLinkedPassenger(); }}>
              <label><span>Passenger name</span><input value={linkedPassengerDraft.fullName} onChange={(event) => { setLinkedPassengerDraft((current) => ({ ...current, fullName: event.target.value })); setVerificationStatus('idle'); }} placeholder="Mock passenger name" autoComplete="off" /></label>
              <label><span>Relation to account holder</span><select value={linkedPassengerDraft.relation} onChange={(event) => setLinkedPassengerDraft((current) => ({ ...current, relation: event.target.value }))}><option>Parent</option><option>Spouse</option><option>Child</option><option>Sibling</option><option>Friend</option><option>Other</option></select></label>
              <label><span>Mock Aadhaar number</span><input value={linkedPassengerDraft.mockAadhaar} onChange={(event) => { setLinkedPassengerDraft((current) => ({ ...current, mockAadhaar: event.target.value.replace(/[^\dXx ]/g, '').slice(0, 14) })); setVerificationStatus('idle'); }} inputMode="numeric" autoComplete="off" aria-describedby="linked-aadhaar-note" /><small id="linked-aadhaar-note">Prototype only. Never enter a real Aadhaar number.</small></label>
              <div className={`passenger-mock-verification is-${verificationStatus}`}>
                <span aria-hidden="true">{verificationStatus === 'verified' ? '✓' : '✦'}</span>
                <div><strong>{verificationStatus === 'verified' ? 'Mock Aadhaar verified' : verificationStatus === 'checking' ? 'Checking mock identity…' : 'Mock Aadhaar verification'}</strong><small>No government service is contacted.</small></div>
                <button type="button" onClick={verifyMockAadhaar} disabled={verificationStatus !== 'idle' || !linkedPassengerDraft.fullName.trim()}>{verificationStatus === 'verified' ? 'Verified' : verificationStatus === 'checking' ? 'Checking…' : 'Verify mock'}</button>
              </div>
            </form>
          </div>
          <footer><span>Only the name, relation, and last four mock digits are saved on this device.</span><div><button type="button" onClick={() => setAddingPassenger(false)}>Cancel</button><button type="button" onClick={addLinkedPassenger} disabled={verificationStatus !== 'verified'}>Add passenger</button></div></footer>
        </section>
      ) : !editing ? (
        <section className="passenger-profile-card" role="dialog" aria-modal="true" aria-labelledby="passenger-profile-title">
          <button className="passenger-profile-close" type="button" aria-label="Close profile" onClick={onClose}>×</button>
          <ProfileAvatar />
          <h2 id="passenger-profile-title">{profile.fullName}</h2>
          <p>Passenger</p>
          <div className="passenger-profile-summary">
            <span>{profile.email}</span>
            <span>{profile.contactNumber}</span>
          </div>
          <div className="passenger-linked-section">
            <div className="passenger-linked-heading"><div><strong>Other passengers</strong><small>Saved on this device</small></div><button type="button" onClick={() => { setLinkedPassengerDraft(emptyLinkedPassenger); setVerificationStatus('idle'); setAddingPassenger(true); }}>＋ Add</button></div>
            {linkedPassengers.length ? <div className="passenger-linked-list">{linkedPassengers.map((passenger) => <article key={passenger.id}><span aria-hidden="true">{passenger.fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span><div><strong>{passenger.fullName}</strong><small>{passenger.relation} · Mock Aadhaar •••• {passenger.aadhaarLast4}</small></div><i aria-label="Mock Aadhaar verified">✓</i></article>)}</div> : <p className="passenger-linked-empty">Add family or companions for faster journey planning.</p>}
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
