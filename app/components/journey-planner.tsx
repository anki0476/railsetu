'use client';

import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import {
  solveJourney,
  stationOptions,
  type CoachPreference,
  type JourneyQuery,
  type LuggageLevel,
  type TravellerProfile,
} from '../lib/journey-engine';

type PlannerForm = JourneyQuery & { date: string; note: string };

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

function stationName(code: string) {
  return stationOptions.find((station) => station.code === code)?.name ?? code;
}

export default function JourneyPlanner() {
  const [form, setForm] = useState<PlannerForm>(initialForm);
  const [submitted, setSubmitted] = useState<PlannerForm>(initialForm);
  const [selectedJourney, setSelectedJourney] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const outcome = useMemo(() => solveJourney(submitted), [submitted]);
  const best = outcome.solutions[0];

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted({ ...form });
    setSelectedJourney(null);
  };

  return (
    <section className="planner-workspace" aria-label="RailSetu journey planner">
      <form className="planner-search-panel" onSubmit={submit}>
        <div className="planner-panel-topline">
          <div>
            <span className="mini-label">Journey details</span>
            <h2>Where do you need to go?</h2>
          </div>
          <span className="planner-data-chip"><i /> Prototype inventory</span>
        </div>

        <div className="planner-fields">
          <label className="planner-field planner-station-field">
            <span>From</span>
            <select value={form.from} onChange={(event) => setForm((value) => ({ ...value, from: event.target.value }))}>
              {stationOptions.map((station) => <option key={station.code} value={station.code}>{station.name} · {station.code}</option>)}
            </select>
          </label>
          <span className="planner-direction" aria-hidden="true">→</span>
          <label className="planner-field planner-station-field">
            <span>To</span>
            <select value={form.to} onChange={(event) => setForm((value) => ({ ...value, to: event.target.value }))}>
              {stationOptions.map((station) => <option key={station.code} value={station.code}>{station.name} · {station.code}</option>)}
            </select>
          </label>
          <label className="planner-field">
            <span>Journey date</span>
            <input type="date" min="2026-08-26" value={form.date} onChange={(event) => setForm((value) => ({ ...value, date: event.target.value }))} />
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
            <button className="tactile-cap glare-surface planner-submit" type="submit">Find confirmed paths <span>→</span></button>
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

      <div className="planner-results" aria-live="polite">
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
    </section>
  );
}
