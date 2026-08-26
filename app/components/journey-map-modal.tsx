'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { JourneySolution } from '../lib/journey-engine';

type JourneyMapModalProps = { open: boolean; onClose: () => void; solution: JourneySolution };
type MapPoint = { code: string; name: string; time: string; latitude: number; longitude: number; x: number; y: number };
type MapStyle = CSSProperties & {
  '--map-x'?: string;
  '--map-y'?: string;
  '--map-next-x'?: string;
  '--map-next-y'?: string;
  '--map-color'?: string;
  '--map-delay'?: string;
};

const stationCoordinates: Record<string, { latitude: number; longitude: number }> = {
  NDLS: { latitude: 28.6428, longitude: 77.2197 },
  ALJN: { latitude: 27.8815, longitude: 78.0746 },
  CNB: { latitude: 26.4549, longitude: 80.3514 },
  PRYJ: { latitude: 25.4358, longitude: 81.8463 },
  PNBE: { latitude: 25.6026, longitude: 85.1376 },
  PUNE: { latitude: 18.5289, longitude: 73.8743 },
  SUR: { latitude: 17.6599, longitude: 75.9064 },
  KLBG: { latitude: 17.3297, longitude: 76.8343 },
  WADI: { latitude: 17.0514, longitude: 76.9903 },
  HYB: { latitude: 17.392, longitude: 78.467 },
  MAS: { latitude: 13.0822, longitude: 80.2753 },
  KPD: { latitude: 12.9724, longitude: 79.1384 },
  JTJ: { latitude: 12.5843, longitude: 78.5746 },
  KJM: { latitude: 13.0005, longitude: 77.6754 },
  SBC: { latitude: 12.9784, longitude: 77.5726 },
};
const segmentColors = ['#4f6fe7', '#9a63e8', '#2d9d73', '#e78b4f'];

function mercatorY(latitude: number) {
  const radians = latitude * Math.PI / 180;
  return Math.log(Math.tan(Math.PI / 4 + radians / 2));
}

export default function JourneyMapModal({ open, onClose, solution }: JourneyMapModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapData = useMemo(() => {
    const rawStops = solution.legs.length ? [solution.legs[0].from, ...solution.legs.map((leg) => leg.to)] : [];
    const locatedStops = rawStops.flatMap((stop) => {
      const coordinate = stationCoordinates[stop.code];
      return coordinate ? [{ ...stop, ...coordinate }] : [];
    });
    if (!locatedStops.length) return null;

    const latitudes = locatedStops.map((stop) => stop.latitude);
    const longitudes = locatedStops.map((stop) => stop.longitude);
    const latitudeSpan = Math.max(1.2, Math.max(...latitudes) - Math.min(...latitudes));
    const longitudeSpan = Math.max(1.6, Math.max(...longitudes) - Math.min(...longitudes));
    const minLatitude = Math.min(...latitudes) - latitudeSpan * 0.28;
    const maxLatitude = Math.max(...latitudes) + latitudeSpan * 0.28;
    const minLongitude = Math.min(...longitudes) - longitudeSpan * 0.18;
    const maxLongitude = Math.max(...longitudes) + longitudeSpan * 0.18;
    const minMercator = mercatorY(minLatitude);
    const maxMercator = mercatorY(maxLatitude);
    const points: MapPoint[] = locatedStops.map((stop) => ({
      ...stop,
      x: ((stop.longitude - minLongitude) / (maxLongitude - minLongitude)) * 100,
      y: (1 - (mercatorY(stop.latitude) - minMercator) / (maxMercator - minMercator)) * 100,
    }));
    const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(`${minLongitude},${minLatitude},${maxLongitude},${maxLatitude}`)}&layer=mapnik`;
    return { points, mapUrl };
  }, [solution]);

  useEffect(() => {
    if (!open) {
      setMapLoaded(false);
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open || !mapData) return null;

  return (
    <div className="journey-map-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="journey-map-dialog" role="dialog" aria-modal="true" aria-labelledby="journey-map-title">
        <header className="journey-map-header">
          <div><span>RailSetu journey map</span><h2 id="journey-map-title">{solution.legs[0].from.name} <i>→</i> {solution.legs.at(-1)?.to.name}</h2></div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close journey map">×</button>
        </header>

        <div className="journey-map-body">
          <div className={`journey-map-canvas ${mapLoaded ? 'is-loaded' : ''}`}>
            <iframe title="Map of the selected RailSetu journey" src={mapData.mapUrl} loading="lazy" onLoad={() => setMapLoaded(true)} />
            <div className="journey-map-wash" aria-hidden="true" />
            {!mapLoaded ? <div className="journey-map-loading" role="status"><i /> Loading route map…</div> : null}
            <div className="journey-map-route" aria-hidden="true">
              {mapData.points.slice(0, -1).map((point, index) => {
                const nextPoint = mapData.points[index + 1];
                return <span className="journey-map-segment" key={`${point.code}-${nextPoint.code}`} style={{ '--map-x': `${point.x}%`, '--map-y': `${point.y}%`, '--map-next-x': `${nextPoint.x}%`, '--map-next-y': `${nextPoint.y}%`, '--map-color': segmentColors[index % segmentColors.length], '--map-delay': `${index * 0.16}s` } as MapStyle} />;
              })}
              {mapData.points.map((point, index) => (
                <span className={`journey-map-stop ${index > 0 && index < mapData.points.length - 1 ? 'is-change' : ''}`} key={point.code} style={{ '--map-x': `${point.x}%`, '--map-y': `${point.y}%`, '--map-color': segmentColors[Math.max(0, index - 1) % segmentColors.length] } as MapStyle}>
                  <i /><b>{point.code}</b><small>{index === 0 ? 'Board' : index === mapData.points.length - 1 ? 'Arrive' : 'Seat change'}</small>
                </span>
              ))}
            </div>
          </div>

          <aside className="journey-map-legend" aria-label="Seat segments">
            <span className="mini-label">Seat segments</span>
            <h3>One train. {solution.legs.length} confirmed seats.</h3>
            <div>
              {solution.legs.map((leg, index) => (
                <article key={leg.id} style={{ '--map-color': segmentColors[index % segmentColors.length] } as MapStyle}>
                  <i /><div><span>{leg.from.code} → {leg.to.code}</span><strong>{leg.coach} · {leg.seat} {leg.berth}</strong><small>{leg.from.time} — {leg.to.time}</small></div>
                </article>
              ))}
            </div>
            <p>Each colour marks the section covered by one confirmed seat. Change only at the highlighted station.</p>
          </aside>
        </div>
      </section>
    </div>
  );
}
