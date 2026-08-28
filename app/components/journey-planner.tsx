'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import {
  JOURNEY_ENGINE_LIMITS,
  solveJourney,
  stationOptions,
  type CoachPreference,
  type JourneyQuery,
  type JourneyRecommendation,
  type JourneySolution,
  type LuggageLevel,
  type TravellerProfile,
} from '../lib/journey-engine';
import { searchJourney } from '../lib/journey-client';
import JourneyMapModal from './journey-map-modal';
import { useSiteLanguage } from './site-language';

type ChangeLimit = 'one' | 'two' | 'any' | 'custom';
type PlannerForm = Omit<JourneyQuery, 'maxChanges'> & {
  date: string;
  note: string;
  changeLimit: ChangeLimit;
  customMaxChanges: number;
};
type SearchPhase = 'idle' | 'searching' | 'found' | 'empty';
type SpeechStatus = 'listening' | 'ready' | 'unsupported' | 'denied' | 'unavailable';
type SpeechResultEvent = Event & {
  resultIndex: number;
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
};
type SpeechErrorEvent = Event & {
  error: 'aborted' | 'audio-capture' | 'bad-grammar' | 'language-not-supported' | 'network' | 'no-speech' | 'not-allowed' | 'service-not-allowed';
};
type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}
type PresetMode = 'journey-preferences' | 'preferences' | 'journey';
type JourneyPreset = Pick<PlannerForm, 'from' | 'to' | 'date' | 'travelClass'>;
type PreferencePreset = Pick<PlannerForm, 'profile' | 'coachPreference' | 'luggage' | 'changeLimit' | 'customMaxChanges' | 'lowerBerth' | 'note'>;
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
  changeLimit: 'one',
  customMaxChanges: 3,
  lowerBerth: true,
  note: '',
};

const submitStyle = {
  '--tactile-depth': '7px',
  '--tactile-base': '#294cb9',
  '--glare-opacity': 0.3,
} as CSSProperties;

const choiceStyle = {
  '--tactile-depth': '6px',
  '--tactile-base': '#294cb9',
  '--glare-opacity': 0.28,
} as CSSProperties;

const mapStyle = {
  '--tactile-depth': '4px',
  '--tactile-base': '#b8c6ec',
  '--glare-opacity': 0.42,
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

function changeLimitValue(form: PlannerForm) {
  if (form.changeLimit === 'any') return JOURNEY_ENGINE_LIMITS.maxChanges;
  if (form.changeLimit === 'custom') return Math.max(0, Math.min(99, Math.round(form.customMaxChanges)));
  return form.changeLimit === 'two' ? 2 : 1;
}

function journeyQuery(form: PlannerForm): JourneyQuery {
  return {
    from: form.from,
    to: form.to,
    travelClass: form.travelClass,
    profile: form.profile,
    coachPreference: form.coachPreference,
    luggage: form.luggage,
    lowerBerth: form.lowerBerth,
    maxChanges: changeLimitValue(form),
  };
}

function changeLimitLabel(form: Pick<PlannerForm, 'changeLimit' | 'customMaxChanges'>) {
  if (form.changeLimit === 'any') return 'any number of changes';
  if (form.changeLimit === 'custom') return 'up to ' + form.customMaxChanges + ' changes';
  return form.changeLimit === 'two' ? 'up to 2 changes' : '1 change';
}

function recommendationChangeLimit(maxChanges: number): Pick<PlannerForm, 'changeLimit' | 'customMaxChanges'> {
  if (maxChanges <= 1) return { changeLimit: 'one', customMaxChanges: maxChanges };
  if (maxChanges === 2) return { changeLimit: 'two', customMaxChanges: maxChanges };
  if (maxChanges >= JOURNEY_ENGINE_LIMITS.maxChanges) return { changeLimit: 'any', customMaxChanges: maxChanges };
  return { changeLimit: 'custom', customMaxChanges: maxChanges };
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
    preset.preferences.changeLimit === form.changeLimit &&
    preset.preferences.customMaxChanges === form.customMaxChanges &&
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
  const { language } = useSiteLanguage();
  const [form, setForm] = useState<PlannerForm>(initialForm);
  const [submitted, setSubmitted] = useState<PlannerForm>(initialForm);
  const [noteOpen, setNoteOpen] = useState(false);
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const [presets, setPresets] = useState<SavedPreset[]>([]);
  const [presetJustSaved, setPresetJustSaved] = useState(false);
  const [searchPhase, setSearchPhase] = useState<SearchPhase>('idle');
  const [speechOpen, setSpeechOpen] = useState(false);
  const [speechDraft, setSpeechDraft] = useState('');
  const [speechStatus, setSpeechStatus] = useState<SpeechStatus>('ready');
  const [mapOpen, setMapOpen] = useState(false);
  const [mapSolution, setMapSolution] = useState<JourneySolution | null>(null);
  const [outcome, setOutcome] = useState(() => solveJourney(journeyQuery(initialForm)));
  const searchTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const searchSequence = useRef(0);
  const searchRequest = useRef<AbortController | null>(null);
  const resultsAnchor = useRef<HTMLDivElement>(null);
  const presetsAnchor = useRef<HTMLElement>(null);
  const presetHighlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  const mapTrigger = useRef<HTMLButtonElement>(null);
  const speechRecognition = useRef<SpeechRecognitionInstance | null>(null);
  const speechBase = useRef('');
  const best = outcome.solutions[0];
  const currentFormIsSaved = useMemo(() => presets.some((preset) => presetMatchesForm(preset, form)), [presets, form]);
  const closeMap = useCallback(() => {
    setMapOpen(false);
    requestAnimationFrame(() => mapTrigger.current?.focus());
  }, []);

  const openMap = (solution: JourneySolution, trigger: HTMLButtonElement) => {
    mapTrigger.current = trigger;
    setMapSolution(solution);
    setMapOpen(true);
  };

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PRESET_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as { version?: number; items?: SavedPreset[] };
      // Hydrate the device-local preset snapshot once after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (parsed.version === 1 && Array.isArray(parsed.items)) setPresets(parsed.items.slice(0, 8));
    } catch {
      // Ignore unavailable or malformed device-local storage.
    }
  }, []);

  useEffect(() => () => {
    searchSequence.current += 1;
    searchRequest.current?.abort();
    searchTimers.current.forEach(clearTimeout);
    if (presetHighlightTimer.current) clearTimeout(presetHighlightTimer.current);
    speechRecognition.current?.abort();
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
      changeLimit: form.changeLimit,
      customMaxChanges: form.customMaxChanges,
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
    setPresetJustSaved(true);
    if (presetHighlightTimer.current) clearTimeout(presetHighlightTimer.current);
    requestAnimationFrame(() => {
      presetsAnchor.current?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'center',
      });
    });
    presetHighlightTimer.current = setTimeout(() => setPresetJustSaved(false), 2200);
  };

  const loadPreset = (preset: SavedPreset) => {
    setForm((current) => ({ ...current, ...preset.journey, ...preset.preferences }));
    if (preset.preferences) setNoteOpen(Boolean(preset.preferences.note));
    document.querySelector('.planner-search-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const removePreset = (id: string) => persistPresets(presets.filter((preset) => preset.id !== id));

  const closeSpeech = () => {
    speechRecognition.current?.abort();
    speechRecognition.current = null;
    setSpeechOpen(false);
  };

  const openSpeech = async () => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    const initialNote = form.note.trim();
    speechBase.current = initialNote;
    setSpeechDraft(initialNote);
    setSpeechOpen(true);
    setNoteOpen(true);

    if (!Recognition) {
      setSpeechStatus('unsupported');
      return;
    }

    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch (error) {
        const permissionDenied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
        console.warn('[voice-dictation] microphone check failed', { name: error instanceof DOMException ? error.name : 'unknown' });
        setSpeechStatus(permissionDenied ? 'denied' : 'unavailable');
        return;
      }
    }

    const recognition = new Recognition();
    speechRecognition.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
    recognition.onresult = (event) => {
      let dictated = '';
      for (let index = 0; index < event.results.length; index += 1) dictated += event.results[index][0].transcript;
      setSpeechDraft([speechBase.current, dictated.trim()].filter(Boolean).join(' ').slice(0, 180));
    };
    recognition.onerror = (event) => {
      console.warn('[voice-dictation] recognition failed', { error: event.error });
      if (event.error === 'aborted' || event.error === 'no-speech') {
        setSpeechStatus('ready');
        return;
      }
      setSpeechStatus(event.error === 'not-allowed' ? 'denied' : 'unavailable');
    };
    recognition.onend = () => setSpeechStatus((current) => current === 'listening' ? 'ready' : current);

    try {
      recognition.start();
      setSpeechStatus('listening');
    } catch {
      setSpeechStatus('unavailable');
    }
  };

  const applySpeech = () => {
    speechRecognition.current?.stop();
    speechRecognition.current = null;
    setForm((current) => ({ ...current, note: speechDraft.trim().slice(0, 180) }));
    setNoteOpen(true);
    setSpeechOpen(false);
  };

  const runSearch = (nextSubmission: PlannerForm) => {
    searchSequence.current += 1;
    const sequence = searchSequence.current;
    searchRequest.current?.abort();
    searchTimers.current.forEach(clearTimeout);
    searchTimers.current = [];
    const query = journeyQuery(nextSubmission);
    const controller = new AbortController();
    searchRequest.current = controller;
    // Event-handler timing is intentionally sampled once for the staged status animation.
    // eslint-disable-next-line react-hooks/purity
    const startedAt = Date.now();
    setSearchPhase('searching');
    requestAnimationFrame(() => resultsAnchor.current?.scrollIntoView({ behavior: 'auto', block: 'start' }));

    const requestTimeout = setTimeout(() => controller.abort(), 7_000);
    searchTimers.current.push(requestTimeout);

    void searchJourney(query, controller.signal)
      .catch(() => solveJourney(query))
      .then((nextOutcome) => {
        clearTimeout(requestTimeout);
        if (sequence !== searchSequence.current) return;
        searchRequest.current = null;
        const hasResults = nextOutcome.solutions.length > 0;
        const elapsed = Date.now() - startedAt;
        const phaseDelay = Math.max(0, 1_200 - elapsed);
        const completionDelay = Math.max(phaseDelay, (hasResults ? 2_300 : 2_500) - elapsed);
        searchTimers.current.push(setTimeout(() => {
          if (sequence === searchSequence.current) setSearchPhase(hasResults ? 'found' : 'empty');
        }, phaseDelay));
        searchTimers.current.push(setTimeout(() => {
          if (sequence !== searchSequence.current) return;
          setSubmitted(nextSubmission);
          setOutcome(nextOutcome);
          setSearchPhase('idle');
        }, completionDelay));
      });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runSearch({ ...form });
  };

  const applyRecommendation = (recommendation: JourneyRecommendation) => {
    const nextSubmission: PlannerForm = {
      ...form,
      travelClass: recommendation.query.travelClass,
      coachPreference: recommendation.query.coachPreference,
      ...recommendationChangeLimit(recommendation.query.maxChanges),
    };
    setForm(nextSubmission);
    runSearch(nextSubmission);
  };

  const continueToPayment = (solution: NonNullable<typeof best>) => {
    const paymentParams = new URLSearchParams({
      fare: String(solution.fare),
      train: `${solution.trainNumber} · ${solution.trainName}`,
      from: submitted.from,
      fromName: stationName(submitted.from),
      to: submitted.to,
      toName: stationName(submitted.to),
      date: submitted.date,
      class: submitted.travelClass,
      comfort: String(solution.comfort),
      profile: submitted.profile,
      legs: solution.legs.map((leg) => [
        leg.from.code,
        leg.from.time,
        leg.to.code,
        leg.to.time,
        leg.coach,
        leg.seat,
        leg.berth,
      ].join('~')).join('|'),
    });
    window.location.assign(`/payment?${paymentParams.toString()}`);
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
            <div className="planner-date-input" onClick={() => dateInput.current?.showPicker?.()}>
              <input ref={dateInput} type="date" min="2026-08-26" value={form.date} onChange={(event) => setForm((value) => ({ ...value, date: event.target.value }))} />
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
              <option value="1A">AC First Class · 1A</option>
              <option value="3A">AC 3 Tier · 3A</option>
              <option value="3E">AC 3 Economy · 3E</option>
              <option value="2A">AC 2 Tier · 2A</option>
              <option value="CC">AC Chair Car · CC</option>
              <option value="EC">Executive Chair Car · EC</option>
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
            <select value={form.changeLimit} onChange={(event) => setForm((value) => ({ ...value, changeLimit: event.target.value as ChangeLimit }))}>
              <option value="one">One seat change</option>
              <option value="two">Up to two changes</option>
              <option value="any">Any number of changes</option>
              <option value="custom">Custom</option>
            </select>
            {form.changeLimit === 'custom' ? (
              <input
                className="planner-custom-change-input"
                type="number"
                min={0}
                max={99}
                inputMode="numeric"
                value={form.customMaxChanges}
                onChange={(event) => setForm((value) => ({ ...value, customMaxChanges: Math.max(0, Math.min(99, Number(event.target.value))) }))}
                aria-label="Custom maximum number of seat changes"
              />
            ) : null}
          </label>
          <label className="planner-field">
            <span>Luggage</span>
            <select value={form.luggage} onChange={(event) => setForm((value) => ({ ...value, luggage: event.target.value as LuggageLevel }))}>
              <option value="none">No luggage</option>
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
                <div className="planner-note-actions">
                  <button className="planner-mic-action" type="button" onClick={openSpeech} aria-label="Dictate journey preferences">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M8.8 20v-4.1l1.9.2a2.3 2.3 0 0 0 2.164-2.1V8.3A5.37 5.37 0 0 0 2 8.25c0 2.8.656 3.054 1 4.55a5.77 5.77 0 0 1 .029 2.758L2 20" />
                      <path d="M17 15a3.5 3.5 0 0 0-.025-4.975" />
                      <path d="M19.8 17.8a7.5 7.5 0 0 0 .003-10.603" />
                    </svg>
                    <span>Dictate</span>
                  </button>
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

      {speechOpen ? (
        <div className="planner-speech-backdrop" role="presentation">
          <section className="planner-speech-modal" role="dialog" aria-modal="true" aria-labelledby="speech-dialog-title">
            <button className="planner-speech-close" type="button" onClick={closeSpeech} aria-label="Cancel dictation">×</button>
            <div className={`planner-speech-animation ${speechStatus === 'denied' || speechStatus === 'unavailable' || speechStatus === 'unsupported' ? 'is-mic-off' : 'is-speaking'}`} aria-hidden="true">
              {speechStatus === 'denied' || speechStatus === 'unavailable' || speechStatus === 'unsupported' ? (
                <svg className="planner-mic-off-icon" width="58" height="58" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="2" x2="22" y1="2" y2="22" />
                  <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
                  <path d="M5 10v2a7 7 0 0 0 12 5" />
                  <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
              ) : (
                <svg width="58" height="58" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8.8 20v-4.1l1.9.2a2.3 2.3 0 0 0 2.164-2.1V8.3A5.37 5.37 0 0 0 2 8.25c0 2.8.656 3.054 1 4.55a5.77 5.77 0 0 1 .029 2.758L2 20" />
                  <path d="M17 15a3.5 3.5 0 0 0-.025-4.975" className="planner-speech-level planner-speech-line-one" />
                  <path d="M19.8 17.8a7.5 7.5 0 0 0 .003-10.603" className="planner-speech-level planner-speech-line-two" />
                </svg>
              )}
            </div>
            <span className="mini-label">Voice preferences</span>
            <h2 id="speech-dialog-title">{speechStatus === 'listening' ? 'Listening…' : speechStatus === 'denied' ? 'Microphone access is blocked' : speechStatus === 'unavailable' ? 'Voice recognition is unavailable' : speechStatus === 'unsupported' ? 'Voice input is not supported' : 'Dictation paused'}</h2>
            <p className={`planner-speech-transcript ${speechDraft ? 'has-text' : ''}`}>
              {speechDraft || (speechStatus === 'denied' ? 'Allow microphone access in your browser, then open Dictate again.' : speechStatus === 'unavailable' ? 'Your microphone is available, but this browser could not start its speech service. Try Chrome or continue typing below.' : speechStatus === 'unsupported' ? 'This browser does not support voice dictation. You can continue typing in the note field.' : speechStatus === 'ready' ? 'No speech was detected. Close this window and tap Dictate to try again.' : 'Start speaking about mobility, luggage, family, or transition preferences.')}
            </p>
            <button
              className="planner-speech-apply"
              type="button"
              onClick={speechStatus === 'denied' || speechStatus === 'unavailable' ? openSpeech : applySpeech}
              aria-label={speechStatus === 'denied' || speechStatus === 'unavailable' ? 'Try voice dictation again' : 'Finish dictation and use these preferences'}
            >
              <span>{speechStatus === 'denied' || speechStatus === 'unavailable' ? 'Try again' : 'Use preference'}</span><i aria-hidden="true">{speechStatus === 'denied' || speechStatus === 'unavailable' ? '↻' : '✓'}</i>
            </button>
          </section>
        </div>
      ) : null}

      <div ref={resultsAnchor} className="planner-results-anchor" aria-hidden="true" />
      {searchPhase !== 'idle' ? <RouteSearchStatus phase={searchPhase} /> : null}

      <div className={`planner-results ${searchPhase !== 'idle' ? 'is-searching' : ''}`} aria-live="polite" aria-hidden={searchPhase !== 'idle'}>
        <div className="planner-results-heading">
          <div>
            <span className="mini-label">Route intelligence</span>
            <h2>{stationName(submitted.from)} <span>→</span> {stationName(submitted.to)}</h2>
            <p>{submitted.date} · {submitted.travelClass} · ranked for {submitted.profile === 'elderly' ? 'limited mobility' : submitted.profile}</p>
          </div>
          <div className="planner-results-actions">
            {best ? (
              <span className="tactile-wrap planner-map-wrap" style={mapStyle}>
                <span className="tactile-base" aria-hidden="true" />
                <button className="tactile-cap glare-surface planner-view-map" type="button" onClick={(event) => openMap(best, event.currentTarget)}>
                  <i aria-hidden="true">⌖</i> View on map
                </button>
              </span>
            ) : null}
            <span className={`planner-result-count ${outcome.solutions.length ? 'has-results' : ''}`}>{outcome.solutions.length} confirmed path{outcome.solutions.length === 1 ? '' : 's'}</span>
          </div>
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
              <span className="planner-bridge" aria-hidden="true">
                <svg className="planner-bridge-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 12 7 7 7-7" className="planner-bridge-head" />
                  <path d="M12 14v5" className="planner-bridge-head" />
                  <path d="M12 5v9" />
                </svg>
              </span>
              <article className="planner-found-card">
                <span>RailSetu path</span>
                <strong>Confirmed throughout</strong>
                <small>{best.legs.length} tickets · {best.changes} seat change · {best.highlights[0].toLowerCase()}</small>
              </article>
            </div>

            {mapSolution ? <JourneyMapModal open={mapOpen} onClose={closeMap} solution={mapSolution} /> : null}

            <div className="planner-solution-list">
              {outcome.solutions.map((solution, solutionIndex) => {
                return (
                  <article className="planner-solution" key={solution.id}>
                    <div className="planner-solution-topline">
                      <div>
                        <span className="planner-rank">{solutionIndex === 0 ? 'Best fit' : `Option ${solutionIndex + 1}`}</span>
                        <h3>{solution.trainNumber} · {solution.trainName}</h3>
                        <p>{solution.duration} total train journey</p>
                      </div>
                      <div className="planner-solution-actions">
                        <span className="tactile-wrap planner-map-wrap" style={mapStyle}>
                          <span className="tactile-base" aria-hidden="true" />
                          <button className="tactile-cap glare-surface planner-view-map" type="button" onClick={(event) => openMap(solution, event.currentTarget)} aria-label={`View ${solution.trainNumber} ${solution.trainName} on map`}>
                            <i aria-hidden="true">⌖</i> View on map
                          </button>
                        </span>
                        <div className="planner-comfort">
                          <strong>{solution.comfort}</strong>
                          <span>Comfort<br />score</span>
                          <a className="planner-comfort-info" href="/comfort-score" aria-label={'Learn how the comfort score of ' + solution.comfort + ' is calculated'}>
                            i
                            <span className="planner-comfort-tooltip" role="tooltip">
                              <b>{solution.comfortDetails.label}</b>
                              <small>{solution.comfortDetails.summary}</small>
                              <span className="planner-comfort-learn">Learn more →</span>
                            </span>
                          </a>
                        </div>
                      </div>
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
                          onClick={() => continueToPayment(solution)}
                        >
                          Continue <span>→</span>
                        </button>
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        ) : (
          <div className={`planner-empty ${outcome.recommendations.length ? 'has-recommendations' : ''}`}>
            <span aria-hidden="true">↗</span>
            <h3>No route matches every constraint yet.</h3>
            {outcome.recommendations.length ? (
              <>
                <p>RailSetu tested safer relaxations against this route&apos;s inventory. These are the smallest changes that unlock at least one confirmed path.</p>
                <div className="planner-recommendation-list" aria-label="Recommended constraint changes">
                  {outcome.recommendations.map((recommendation, index) => (
                    <article className="planner-recommendation" key={recommendation.id}>
                      <span>Option {String(index + 1).padStart(2, '0')}</span>
                      <h4>{recommendation.title}</h4>
                      <p>{recommendation.explanation}</p>
                      <div>{recommendation.changes.map((change) => <small key={change}>{change}</small>)}</div>
                      <button type="button" onClick={() => applyRecommendation(recommendation)}>Apply changes and search <i aria-hidden="true">→</i></button>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p>No same-train inventory currently connects these stations, even after testing every supported class and safe constraint relaxation.</p>
                <button type="button" onClick={() => { setForm(initialForm); setSubmitted(initialForm); setOutcome(solveJourney(journeyQuery(initialForm))); }}>Restore the recommended search</button>
              </>
            )}
          </div>
        )}
      </div>

      <p className="planner-disclaimer">Prototype results use representative inventory for product demonstration. Live railway availability will be connected in the data-integration phase.</p>

      <section ref={presetsAnchor} className={`planner-presets ${presetJustSaved ? 'is-save-highlighted' : ''}`} aria-labelledby="saved-presets-title">
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
                  {preset.preferences ? ` · ${preset.preferences.profile} · ${changeLimitLabel(preset.preferences)}` : ''}
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
