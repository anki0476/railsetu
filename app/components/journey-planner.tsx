'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import {
  solveJourney,
  stationOptions,
  type CoachPreference,
  type JourneyQuery,
  type LuggageLevel,
  type TravellerProfile,
} from '../lib/journey-engine';

type PlannerForm = JourneyQuery & { date: string; note: string };
type SearchPhase = 'idle' | 'searching' | 'found' | 'empty';
type PresetMode = 'journey-preferences' | 'preferences' | 'journey';
type JourneyPreset = Pick<PlannerForm, 'from' | 'to' | 'date' | 'travelClass'>;
type PreferencePreset = Pick<PlannerForm, 'profile' | 'coachPreference' | 'luggage' | 'maxChanges' | 'lowerBerth' | 'note'>;
type SavedPreset = {
  id: string;
  mode: PresetMode;
  createdAt: number;
  journey?: JourneyPreset;
  preferences?: PreferencePreset;
};

const PRESET_STORAGE_KEY = 'railsetu.saved-presets.v1';

const initialForm: PlannerForm = {
  from: 'NDLS',
  to: 'PNBE',
  date: '2026-08-30',
  travelClass: '3A',
  profile: 'elderly',
  coachPreference: 'same',
  luggage: 'light',
  maxChanges: 1,
  lowerBerth: true,
  note: '',
};

const submitStyle = {
  '--tactile-depth': '7px',
  '--tactile-base': '#0b1229',
  '--glare-opacity': 0.3,
} as CSSProperties;

const choiceStyle = {
  '--tactile-depth': '6px',
  '--tactile-base': '#294cb9',
  '--glare-opacity': 0.28,
} as CSSProperties;

const money = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const calendarDots = [
  { cx: 8, cy: 14 },
  { cx: 12, cy: 14 },
  { cx: 16, cy: 14 },
  { cx: 8, cy: 18 },
  { cx: 12, cy: 18 },
  { cx: 16, cy: 18 },
];

function stationName(code: string) {
  return stationOptions.find((station) => station.code === code)?.name ?? code;
}

function BookmarkIcon({ checked = false }: { checked?: boolean }) {
  return (
    <svg className={`preset-bookmark-icon ${checked ? 'is-checked' : ''}`} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" className="preset-bookmark-path" />
      {checked ? <path d="m9 10 2 2 4-4" className="preset-check-path" /> : null}
    </svg>
  );
}

function RouteSearchStatus({ phase }: { phase: Exclude<SearchPhase, 'idle'> }) {
  const searching = phase === 'searching';
  const found = phase === 'found';

  return (
    <div className={`planner-search-status is-${phase}`} role="status" aria-live="polite">
      <span className="planner-search-status-icon" aria-hidden="true">
        {searching ? (
          <svg className="search-status-icon" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        ) : found ? (
          <svg className="route-status-icon" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="19" r="3" className="route-status-circle" />
            <circle cx="18" cy="5" r="3" className="route-status-circle" />
            <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" className="route-status-line" />
          </svg>
        ) : (
          <svg className="route-off-status-icon" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="19" r="3" />
            <path d="M9 19h8.5c.4 0 .9-.1 1.3-.2" />
            <path d="M5.2 5.2A3.5 3.53 0 0 0 6.5 12H12" />
            <path d="m2 2 20 20" />
            <path d="M21 15.3a3.5 3.5 0 0 0-3.3-3.3" />
            <path d="M15 5h-4.3" />
            <circle cx="18" cy="5" r="3" />
          </svg>
        )}
      </span>
      <div>
        <span>{searching ? 'Searching the train' : found ? 'Confirmed path found' : 'No qualifying path found'}</span>
        <strong>{searching ? 'Checking seat segments…' : found ? 'Building your clearest journey…' : 'Try relaxing one preference.'}</strong>
      </div>
      <i aria-hidden="true" />
    </div>
  );
}

function presetMatchesForm(preset: SavedPreset, form: PlannerForm) {
  const journeyMatches = !preset.journey || (
    preset.journey.from === form.from &&
    preset.journey.to === form.to &&
    preset.journey.date === form.date &&
    preset.journey.travelClass === form.travelClass
  );
  const preferencesMatch = !preset.preferences || (
    preset.preferences.profile === form.profile &&
    preset.preferences.coachPreference === form.coachPreference &&
    preset.preferences.luggage === form.luggage &&
    preset.preferences.maxChanges === form.maxChanges &&
    preset.preferences.lowerBerth === form.lowerBerth &&
    preset.preferences.note === form.note
  );
  return journeyMatches && preferencesMatch;
}

function StationSwapButton({ onSwap }: { onSwap: () => void }) {
  const [animating, setAnimating] = useState(false);
  const [animationKey, setAnimationKey] = useState(0);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  const playAnimation = () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setAnimationKey((value) => value + 1);
    setAnimating(true);
    resetTimer.current = setTimeout(() => setAnimating(false), 500);
  };

  const handleClick = () => {
    playAnimation();
    onSwap();
  };

  return (
    <button
      className={`planner-direction ${animating ? 'is-animating' : ''}`}
      type="button"
      aria-label="Swap departure and arrival stations"
      title="Swap stations"
      onMouseEnter={() => { if (!animating) playAnimation(); }}
      onClick={handleClick}
    >
      <svg key={animationKey} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M16 3l4 4-4 4" className="swap-right-arrow" />
        <path d="M20 7H4" className="swap-right-arrow" />
        <path d="M8 21l-4-4 4-4" className="swap-left-arrow" />
        <path d="M4 17h16" className="swap-left-arrow" />
      </svg>
    </button>
  );
}

export default function JourneyPlanner() {
  const [form, setForm] = useState<PlannerForm>(initialForm);
  const [submitted, setSubmitted] = useState<PlannerForm>(initialForm);
  const [selectedJourney, setSelectedJourney] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const [presets, setPresets] = useState<SavedPreset[]>([]);
  const [searchPhase, setSearchPhase] = useState<SearchPhase>('idle');
  const searchTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const outcome = useMemo(() => solveJourney(submitted), [submitted]);
  const best = outcome.solutions[0];
  const currentFormIsSaved = useMemo(() => presets.some((preset) => presetMatchesForm(preset, form)), [presets, form]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PRESET_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as { version?: number; items?: SavedPreset[] };
      if (parsed.version === 1 && Array.isArray(parsed.items)) setPresets(parsed.items.slice(0, 8));
    } catch {
      // Ignore unavailable or malformed device-local storage.
    }
  }, []);

  useEffect(() => () => {
    searchTimers.current.forEach(clearTimeout);
  }, []);

  const persistPresets = (next: SavedPreset[]) => {
    setPresets(next);
    try {
      window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify({ version: 1, items: next }));
    } catch {
      // The current session still keeps working if device storage is unavailable.
    }
  };

  const savePreset = (mode: PresetMode) => {
    const journey: JourneyPreset = { from: form.from, to: form.to, date: form.date, travelClass: form.travelClass };
    const preferences: PreferencePreset = {
      profile: form.profile,
      coachPreference: form.coachPreference,
      luggage: form.luggage,
      maxChanges: form.maxChanges,
      lowerBerth: form.lowerBerth,
      note: form.note,
    };
    const preset: SavedPreset = {
      id: window.crypto.randomUUID(),
      mode,
      createdAt: Date.now(),
      journey: mode === 'preferences' ? undefined : journey,
      preferences: mode === 'journey' ? undefined : preferences,
    };
    const next = [preset, ...presets.filter((item) => !(item.mode === mode && presetMatchesForm(item, form)))].slice(0, 8);
    persistPresets(next);
    setSaveMenuOpen(false);
  };

  const loadPreset = (preset: SavedPreset) => {
    setForm((current) => ({ ...current, ...preset.journey, ...preset.preferences }));
    if (preset.preferences) setNoteOpen(Boolean(preset.preferences.note));
    document.querySelector('.planner-search-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const removePreset = (id: string) => persistPresets(presets.filter((preset) => preset.id !== id));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    searchTimers.current.forEach(clearTimeout);
    searchTimers.current = [];
    const nextSubmission = { ...form };
    const hasResults = solveJourney(nextSubmission).solutions.length > 0;
    setSelectedJourney(null);
    setSearchPhase('searching');
    searchTimers.current.push(setTimeout(() => setSearchPhase(hasResults ? 'found' : 'empty'), 1200));
    searchTimers.current.push(setTimeout(() => {
      setSubmitted(nextSubmission);
      setSearchPhase('idle');
    }, hasResults ? 2300 : 2500));
  };

  return (
    <section className="planner-workspace" aria-label="RailSetu journey planner">
      <form className="planner-search-panel" onSubmit={submit}>
        <span className="planner-panel-trail" aria-hidden="true" />
        <div className="planner-panel-topline">
          <div>
            <span className="mini-label">Journey details</span>
            <h2>Where do you need to go?</h2>
          </div>
          <div className="planner-panel-actions">
            <span className="planner-data-chip"><i /> Prototype inventory</span>
            <div
              className="planner-save-control"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setSaveMenuOpen(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setSaveMenuOpen(false);
              }}
            >
              <button
                className={`planner-save-button ${currentFormIsSaved ? 'is-saved' : ''}`}
                type="button"
                aria-haspopup="menu"
                aria-expanded={saveMenuOpen}
                onClick={() => setSaveMenuOpen((current) => !current)}
              >
                <BookmarkIcon checked={currentFormIsSaved} />
                <span>{currentFormIsSaved ? 'Saved' : 'Save'}</span>
              </button>
              {saveMenuOpen ? (
                <div className="planner-save-menu" role="menu" aria-label="Save preset options">
                  <span>Save as a reusable preset</span>
                  <button type="button" role="menuitem" onClick={() => savePreset('journey-preferences')}>
                    <i>01</i><span><strong>Journey stations + preferences</strong><small>Save the complete search setup</small></span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => savePreset('preferences')}>
                    <i>02</i><span><strong>Preferences only</strong><small>Reuse traveller-aware constraints</small></span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => savePreset('journey')}>
                    <i>03</i><span><strong>Journey stations only</strong><small>Save stations, date, and class</small></span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="planner-fields">
          <label className="planner-field planner-station-field">
            <span>From</span>
            <select value={form.from} onChange={(event) => setForm((value) => ({ ...value, from: event.target.value }))}>
              {stationOptions.map((station) => <option key={station.code} value={station.code}>{station.name} · {station.code}</option>)}
            </select>
          </label>
          <StationSwapButton onSwap={() => setForm((value) => ({ ...value, from: value.to, to: value.from }))} />
          <label className="planner-field planner-station-field">
            <span>To</span>
            <select value={form.to} onChange={(event) => setForm((value) => ({ ...value, to: event.target.value }))}>
              {stationOptions.map((station) => <option key={station.code} value={station.code}>{station.name} · {station.code}</option>)}
            </select>
          </label>
          <label className="planner-field planner-date-field">
            <span>Journey date</span>
            <div className="planner-date-input">
              <input type="date" min="2026-08-26" value={form.date} onChange={(event) => setForm((value) => ({ ...value, date: event.target.value }))} />
              <span className="planner-calendar-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 2v4" />
                  <path d="M16 2v4" />
                  <rect width="18" height="18" x="3" y="4" rx="2" />
                  <path d="M3 10h18" />
                  {calendarDots.map((dot, index) => (
                    <circle key={`${dot.cx}-${dot.cy}`} cx={dot.cx} cy={dot.cy} r="1" fill="currentColor" stroke="none" className="calendar-dot" style={{ animationDelay: `${index * 0.17}s` }} />
                  ))}
                </svg>
              </span>
            </div>
          </label>
          <label className="planner-field">
            <span>Class</span>
            <select value={form.travelClass} onChange={(event) => setForm((value) => ({ ...value, travelClass: event.target.value }))}>
              <option value="3A">AC 3 Tier · 3A</option>
              <option value="2A">AC 2 Tier · 2A</option>
              <option value="SL">Sleeper · SL</option>
            </select>
          </label>
        </div>

        <div className="planner-preferences-head">
          <div><span className="mini-label">Traveller-aware planning</span><strong>Shape the journey around the person</strong></div>
          <p>These constraints change which segmented routes qualify.</p>
        </div>

        <div className="planner-preferences">
          <label className="planner-field">
            <span>Travelling as</span>
            <select value={form.profile} onChange={(event) => setForm((value) => ({ ...value, profile: event.target.value as TravellerProfile }))}>
              <option value="standard">Standard traveller</option>
              <option value="elderly">Elderly / limited mobility</option>
              <option value="family">Family with children</option>
            </select>
          </label>
          <label className="planner-field">
            <span>Coach movement</span>
            <select value={form.coachPreference} onChange={(event) => setForm((value) => ({ ...value, coachPreference: event.target.value as CoachPreference }))}>
              <option value="same">No coach changes</option>
              <option value="nearby">Nearby coaches only</option>
              <option value="any">Any coach</option>
            </select>
          </label>
          <label className="planner-field">
            <span>Maximum changes</span>
            <select value={form.maxChanges} onChange={(event) => setForm((value) => ({ ...value, maxChanges: Number(event.target.value) }))}>
              <option value={1}>One seat change</option>
              <option value={2}>Up to two changes</option>
            </select>
          </label>
          <label className="planner-field">
            <span>Luggage</span>
            <select value={form.luggage} onChange={(event) => setForm((value) => ({ ...value, luggage: event.target.value as LuggageLevel }))}>
              <option value="light">Light / manageable</option>
              <option value="heavy">Heavy luggage</option>
            </select>
          </label>
          <label className="planner-check">
            <input type="checkbox" checked={form.lowerBerth} onChange={(event) => setForm((value) => ({ ...value, lowerBerth: event.target.checked }))} />
            <span><i aria-hidden="true">✓</i><strong>Prefer lower berth</strong><small>Used in comfort ranking</small></span>
          </label>
          <span className="tactile-wrap planner-submit-wrap" style={submitStyle}>
            <span className="tactile-base" aria-hidden="true" />
            <button className="tactile-cap glare-surface planner-submit" type="submit" disabled={searchPhase !== 'idle'}>
              {searchPhase === 'idle' ? 'Find confirmed paths' : 'Searching routes'} <span>{searchPhase === 'idle' ? '→' : '⌁'}</span>
            </button>
          </span>

          <div className={`planner-note-card ${noteOpen ? 'is-open' : ''}`}>
            <span className="planner-note-glow" aria-hidden="true" />
            <div className="planner-note-surface">
              <div className="planner-note-head">
                <span className="planner-note-icon" aria-hidden="true">✦</span>
                <div>
                  <strong>Anything else we should know?</strong>
                  <small>Add mobility, family, luggage, or transition preferences in your own words.</small>
                </div>
                <button
                  className="planner-note-action"
                  type="button"
                  aria-expanded={noteOpen}
                  aria-controls="planner-note-field"
                  onClick={() => setNoteOpen((current) => !current)}
                >
                  {noteOpen ? 'Done' : form.note ? 'Edit note' : 'Add note'}
                  <span aria-hidden="true">{noteOpen ? '✓' : '+'}</span>
                </button>
              </div>
              <div className="planner-note-reveal" id="planner-note-field" aria-hidden={!noteOpen}>
                <div>
                  <label>
                    <span>Additional journey context</span>
                    <textarea
                      value={form.note}
                      maxLength={180}
                      placeholder="For example: My mother uses a walking stick, so please avoid rushed platform or coach changes."
                      onChange={(event) => setForm((value) => ({ ...value, note: event.target.value }))}
                    />
                    <small>{form.note.length} / 180</small>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>

      {searchPhase !== 'idle' ? <RouteSearchStatus phase={searchPhase} /> : null}

      <div className={`planner-results ${searchPhase !== 'idle' ? 'is-searching' : ''}`} aria-live="polite" aria-hidden={searchPhase !== 'idle'}>
        <div className="planner-results-heading">
          <div>
            <span className="mini-label">Route intelligence</span>
            <h2>{stationName(submitted.from)} <span>→</span> {stationName(submitted.to)}</h2>
            <p>{submitted.date} · {submitted.travelClass} · ranked for {submitted.profile === 'elderly' ? 'limited mobility' : submitted.profile}</p>
          </div>
          <span className={`planner-result-count ${outcome.solutions.length ? 'has-results' : ''}`}>{outcome.solutions.length} confirmed path{outcome.solutions.length === 1 ? '' : 's'}</span>
        </div>

        {submitted.note.trim() ? (
          <div className="planner-submitted-note">
            <span>Added context</span>
            <p>“{submitted.note.trim()}”</p>
          </div>
        ) : null}

        {best ? (
          <>
            <div className="planner-comparison">
              <article className="planner-direct-card">
                <span>Direct booking</span>
                <strong>{outcome.direct?.label ?? 'Unavailable'}</strong>
                <small>{outcome.direct ? `${money.format(outcome.direct.fare)} · confirmation uncertain` : 'No continuous berth found'}</small>
              </article>
              <span className="planner-bridge" aria-hidden="true">→</span>
              <article className="planner-found-card">
                <span>RailSetu path</span>
                <strong>Confirmed throughout</strong>
                <small>{best.legs.length} tickets · {best.changes} seat change · {best.highlights[0].toLowerCase()}</small>
              </article>
            </div>

            <div className="planner-solution-list">
              {outcome.solutions.map((solution, solutionIndex) => {
                const selected = selectedJourney === solution.id;
                return (
                  <article className={`planner-solution ${selected ? 'is-selected' : ''}`} key={solution.id}>
                    <div className="planner-solution-topline">
                      <div>
                        <span className="planner-rank">{solutionIndex === 0 ? 'Best fit' : `Option ${solutionIndex + 1}`}</span>
                        <h3>{solution.trainNumber} · {solution.trainName}</h3>
                        <p>{solution.duration} total train journey</p>
                      </div>
                      <div className="planner-comfort"><strong>{solution.comfort}</strong><span>Comfort<br />score</span></div>
                    </div>

                    <div className="planner-leg-list">
                      {solution.legs.map((leg, legIndex) => (
                        <div className="planner-leg" key={leg.id}>
                          <div className="planner-leg-number">0{legIndex + 1}</div>
                          <div className="planner-leg-route">
                            <span>{leg.from.time}</span><strong>{leg.from.code}</strong><i>→</i><strong>{leg.to.code}</strong><span>{leg.to.time}</span>
                          </div>
                          <div className="planner-seat"><small>Confirmed seat</small><strong>{leg.coach} · {leg.seat} {leg.berth}</strong></div>
                          {legIndex < solution.legs.length - 1 ? <div className="planner-change-note">Change seat at {leg.to.name}<span>{leg.coach} · {leg.seat} → {solution.legs[legIndex + 1].coach} · {solution.legs[legIndex + 1].seat}</span></div> : null}
                        </div>
                      ))}
                    </div>

                    <div className="planner-solution-footer">
                      <div className="planner-highlights">{solution.highlights.map((highlight) => <span key={highlight}>✓ {highlight}</span>)}</div>
                      <div className="planner-fare"><small>Total fare</small><strong>{money.format(solution.fare)}</strong></div>
                      <span className="tactile-wrap planner-choice-wrap" style={choiceStyle}>
                        <span className="tactile-base" aria-hidden="true" />
                        <button
                          className="tactile-cap glare-surface"
                          type="button"
                          onClick={() => setSelectedJourney(selected ? null : solution.id)}
                        >
                          {selected ? 'Selected ✓' : 'Choose journey'} <span>→</span>
                        </button>
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        ) : (
          <div className="planner-empty">
            <span aria-hidden="true">↗</span>
            <h3>No route matches every constraint yet.</h3>
            <p>Try 3A inventory, allow nearby coach changes, or increase the maximum seat changes.</p>
            <button type="button" onClick={() => { setForm(initialForm); setSubmitted(initialForm); }}>Restore the recommended search</button>
          </div>
        )}
      </div>

      <p className="planner-disclaimer">Prototype results use representative inventory for product demonstration. Live railway availability will be connected in the data-integration phase.</p>

      <section className="planner-presets" aria-labelledby="saved-presets-title">
        <div className="planner-presets-heading">
          <div>
            <span className="mini-label">Saved presets</span>
            <h2 id="saved-presets-title">Your routes, ready when you are.</h2>
          </div>
          <p>Saved on this device. Load a preset to refill the planner instantly.</p>
        </div>

        {presets.length ? (
          <div className="planner-preset-grid">
            {presets.map((preset) => (
              <article className="planner-preset-card" key={preset.id}>
                <div className="planner-preset-topline">
                  <span className="planner-preset-icon"><BookmarkIcon checked /></span>
                  <span className="planner-preset-kind">
                    {preset.mode === 'journey-preferences' ? 'Complete setup' : preset.mode === 'preferences' ? 'Preferences' : 'Journey'}
                  </span>
                  <button type="button" aria-label="Remove saved preset" onClick={() => removePreset(preset.id)}>×</button>
                </div>
                <h3>
                  {preset.journey ? `${stationName(preset.journey.from)} → ${stationName(preset.journey.to)}` : 'Traveller preferences'}
                </h3>
                <p>
                  {preset.journey ? `${preset.journey.date} · ${preset.journey.travelClass}` : 'Use with any pair of stations'}
                  {preset.preferences ? ` · ${preset.preferences.profile} · ${preset.preferences.maxChanges} change${preset.preferences.maxChanges === 1 ? '' : 's'}` : ''}
                </p>
                <button className="planner-use-preset" type="button" onClick={() => loadPreset(preset)}>Use preset <span>↗</span></button>
              </article>
            ))}
          </div>
        ) : (
          <div className="planner-presets-empty">
            <span className="planner-empty-bookmark"><BookmarkIcon /></span>
            <div><strong>No presets saved yet.</strong><p>Use the Save button above to keep a journey, your preferences, or both.</p></div>
          </div>
        )}
      </section>
    </section>
  );
}
