'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { JourneySolution } from '../lib/journey-engine';

type JourneyMapModalProps = { open: boolean; onClose: () => void; solution: JourneySolution; sharePath: string };
type MapPoint = { code: string; name: string; time: string; latitude: number; longitude: number };
type RenderedPoint = MapPoint & { x: number; y: number };
type MapStyle = CSSProperties & {
  '--map-x'?: string;
  '--map-y'?: string;
  '--map-next-x'?: string;
  '--map-next-y'?: string;
  '--map-color'?: string;
  '--map-delay'?: string;
};

const TILE_SIZE = 256;
const MIN_ZOOM = 4;
const MAX_ZOOM = 10;
const stationCoordinates: Record<string, { latitude: number; longitude: number }> = {
  NDLS: { latitude: 28.6428, longitude: 77.2197 },
  ALJN: { latitude: 27.8815, longitude: 78.0746 },
  CNB: { latitude: 26.4549, longitude: 80.3514 },
  PRYJ: { latitude: 25.4358, longitude: 81.8463 },
  PNBE: { latitude: 25.6026, longitude: 85.1376 },
  HWH: { latitude: 22.5839, longitude: 88.3428 },
  BPL: { latitude: 23.2685, longitude: 77.4139 },
  NGP: { latitude: 21.1539, longitude: 79.0882 },
  CSMT: { latitude: 18.9398, longitude: 72.8355 },
  PUNE: { latitude: 18.5289, longitude: 73.8743 },
  SUR: { latitude: 17.6599, longitude: 75.9064 },
  KLBG: { latitude: 17.3297, longitude: 76.8343 },
  WADI: { latitude: 17.0514, longitude: 76.9903 },
  HYB: { latitude: 17.392, longitude: 78.467 },
  BZA: { latitude: 16.5184, longitude: 80.6193 },
  MAS: { latitude: 13.0822, longitude: 80.2753 },
  KPD: { latitude: 12.9724, longitude: 79.1384 },
  JTJ: { latitude: 12.5843, longitude: 78.5746 },
  KJM: { latitude: 13.0005, longitude: 77.6754 },
  SBC: { latitude: 12.9784, longitude: 77.5726 },
};
const segmentColors = ['#4f6fe7', '#9a63e8', '#2d9d73', '#e78b4f'];

function project(latitude: number, longitude: number, zoom: number) {
  const worldSize = TILE_SIZE * 2 ** zoom;
  const boundedLatitude = Math.max(-85.0511, Math.min(85.0511, latitude));
  const sine = Math.sin(boundedLatitude * Math.PI / 180);
  return {
    x: ((longitude + 180) / 360) * worldSize,
    y: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * worldSize,
  };
}

function fitZoom(points: MapPoint[], width: number, height: number) {
  const availableWidth = Math.max(180, width - 170);
  const availableHeight = Math.max(150, height - 160);
  for (let zoom = MAX_ZOOM; zoom >= MIN_ZOOM; zoom -= 1) {
    const projected = points.map((point) => project(point.latitude, point.longitude, zoom));
    const xs = projected.map((point) => point.x);
    const ys = projected.map((point) => point.y);
    if (Math.max(...xs) - Math.min(...xs) <= availableWidth && Math.max(...ys) - Math.min(...ys) <= availableHeight) return zoom;
  }
  return MIN_ZOOM;
}

function RouteMap({ points }: { points: MapPoint[] }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; panX: number; panY: number } | null>(null);
  const [viewport, setViewport] = useState({ width: 760, height: 520 });
  const [zoomOffset, setZoomOffset] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const fittedZoom = useMemo(() => fitZoom(points, viewport.width, viewport.height), [points, viewport]);
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fittedZoom + zoomOffset));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => setViewport({ width: canvas.clientWidth, height: canvas.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setZoomOffset(0);
    setPan({ x: 0, y: 0 });
  }, [points]);

  useEffect(() => setMapLoaded(false), [zoom]);

  const map = useMemo(() => {
    const worldPoints = points.map((point) => ({ ...point, ...project(point.latitude, point.longitude, zoom) }));
    const xs = worldPoints.map((point) => point.x);
    const ys = worldPoints.map((point) => point.y);
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
    const originX = centerX - viewport.width / 2 - pan.x;
    const originY = centerY - viewport.height / 2 - pan.y;
    const renderedPoints: RenderedPoint[] = worldPoints.map((point) => ({ ...point, x: point.x - originX, y: point.y - originY }));
    const tiles: Array<{ id: string; url: string; left: number; top: number }> = [];
    const tileCount = 2 ** zoom;
    const startX = Math.floor(originX / TILE_SIZE) - 1;
    const endX = Math.ceil((originX + viewport.width) / TILE_SIZE) + 1;
    const startY = Math.max(0, Math.floor(originY / TILE_SIZE) - 1);
    const endY = Math.min(tileCount - 1, Math.ceil((originY + viewport.height) / TILE_SIZE) + 1);
    for (let tileY = startY; tileY <= endY; tileY += 1) {
      for (let tileX = startX; tileX <= endX; tileX += 1) {
        const wrappedX = ((tileX % tileCount) + tileCount) % tileCount;
        tiles.push({ id: `${zoom}-${tileX}-${tileY}`, url: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png`, left: tileX * TILE_SIZE - originX, top: tileY * TILE_SIZE - originY });
      }
    }
    return { points: renderedPoints, tiles };
  }, [pan, points, viewport, zoom]);

  const changeZoom = (change: number) => {
    setZoomOffset((current) => Math.max(MIN_ZOOM - fittedZoom, Math.min(MAX_ZOOM - fittedZoom, current + change)));
    setPan({ x: 0, y: 0 });
  };

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button,a')) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPan({ x: drag.panX + event.clientX - drag.x, y: drag.panY + event.clientY - drag.y });
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div ref={canvasRef} className={`journey-map-canvas ${mapLoaded ? 'is-loaded' : ''} ${dragging ? 'is-dragging' : ''}`} role="group" aria-label="Interactive map of the selected RailSetu journey" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
      <div className="journey-map-tiles" aria-hidden="true">
        {map.tiles.map((tile) => <img key={tile.id} src={tile.url} alt="" draggable={false} decoding="async" onLoad={() => setMapLoaded(true)} style={{ left: tile.left, top: tile.top }} />)}
      </div>
      <div className="journey-map-wash" aria-hidden="true" />
      {!mapLoaded ? <div className="journey-map-loading" role="status"><i /> Loading route map…</div> : null}
      <div className="journey-map-route" aria-hidden="true">
        {map.points.slice(0, -1).map((point, index) => {
          const nextPoint = map.points[index + 1];
          return <span className="journey-map-segment" key={`${point.code}-${nextPoint.code}-${zoom}`} style={{ '--map-x': `${point.x}px`, '--map-y': `${point.y}px`, '--map-next-x': `${nextPoint.x}px`, '--map-next-y': `${nextPoint.y}px`, '--map-color': segmentColors[index % segmentColors.length], '--map-delay': `${index * 0.16}s` } as MapStyle} />;
        })}
        {map.points.map((point, index) => (
          <span className={`journey-map-stop ${index > 0 && index < map.points.length - 1 ? 'is-change' : ''}`} key={point.code} style={{ '--map-x': `${point.x}px`, '--map-y': `${point.y}px`, '--map-color': segmentColors[Math.max(0, index - 1) % segmentColors.length] } as MapStyle}>
            <i /><b>{point.code}</b><small>{index === 0 ? 'Board' : index === map.points.length - 1 ? 'Arrive' : 'Seat change'}</small>
          </span>
        ))}
      </div>
      <div className="journey-map-controls" aria-label="Map zoom controls">
        <button type="button" onClick={() => changeZoom(1)} disabled={zoom === MAX_ZOOM} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => changeZoom(-1)} disabled={zoom === MIN_ZOOM} aria-label="Zoom out">−</button>
      </div>
      <a className="journey-map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
    </div>
  );
}

export default function JourneyMapModal({ open, onClose, solution, sharePath }: JourneyMapModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied'>('idle');
  const mapPoints = useMemo(() => {
    const rawStops = solution.legs.length ? [solution.legs[0].from, ...solution.legs.map((leg) => leg.to)] : [];
    return rawStops.flatMap((stop) => {
      const coordinate = stationCoordinates[stop.code];
      return coordinate ? [{ ...stop, ...coordinate }] : [];
    });
  }, [solution]);

  useEffect(() => {
    if (!open) return;
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

  async function shareRoute() {
    const firstStop = solution.legs[0].from;
    const lastStop = solution.legs.at(-1)?.to;
    const routeSummary = solution.legs.map((leg) => `${leg.from.code} → ${leg.to.code} (${leg.from.time}–${leg.to.time})`).join(' · ');
    const text = `${solution.trainNumber} · ${solution.trainName}\n${routeSummary}`;
    const url = new URL(sharePath, window.location.origin).toString();

    try {
      if (navigator.share) {
        await navigator.share({ title: `RailSetu route · ${firstStop.name} to ${lastStop?.name}`, text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setShareStatus('copied');
      window.setTimeout(() => setShareStatus('idle'), 2200);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      window.prompt('Copy your RailSetu route', `${text}\n${url}`);
    }
  }

  if (!open || !mapPoints.length) return null;

  return (
    <div className="journey-map-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="journey-map-dialog" role="dialog" aria-modal="true" aria-labelledby="journey-map-title">
        <header className="journey-map-header">
          <div><span>RailSetu journey map</span><h2 id="journey-map-title">{solution.legs[0].from.name} <i>→</i> {solution.legs.at(-1)?.to.name}</h2></div>
          <div className="journey-map-header-actions">
            <button className="journey-map-share" type="button" onClick={shareRoute} aria-live="polite">{shareStatus === 'copied' ? 'Link copied' : 'Share'} <span aria-hidden="true">{shareStatus === 'copied' ? '✓' : '↗'}</span></button>
            <button className="journey-map-close" ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close journey map">×</button>
          </div>
        </header>

        <div className="journey-map-body">
          <RouteMap points={mapPoints} />
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
