'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { JourneySolution } from '../lib/journey-engine';
import { stationByCode } from '../lib/station-catalog';

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
const segmentColors = ['#4f6fe7', '#9a63e8', '#2d9d73', '#e78b4f'];

type GoogleMapInstance = { fitBounds: (bounds: unknown, padding?: number) => void; setOptions: (options: Record<string, unknown>) => void };
type GoogleMarker = { addListener: (event: string, handler: () => void) => void; setMap: (map: null) => void };
type GooglePolyline = { setMap: (map: null) => void };
type GoogleInfoWindow = { open: (options: { anchor: GoogleMarker; map: GoogleMapInstance }) => void; close: () => void };
type GoogleMapsApi = {
  Map: new (node: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
  Marker: new (options: Record<string, unknown>) => GoogleMarker;
  Polyline: new (options: Record<string, unknown>) => GooglePolyline;
  InfoWindow: new (options: { content: string }) => GoogleInfoWindow;
  LatLngBounds: new () => { extend: (point: { lat: number; lng: number }) => void };
};

declare global {
  interface Window {
    google?: { maps: GoogleMapsApi };
    __railsetuGoogleMapsPromise?: Promise<GoogleMapsApi>;
    __railsetuGoogleMapsReady?: () => void;
  }
}

const GOOGLE_MAPS_SCRIPT_ID = 'railsetu-google-maps';

function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (window.__railsetuGoogleMapsPromise) return window.__railsetuGoogleMapsPromise;
  window.__railsetuGoogleMapsPromise = new Promise<GoogleMapsApi>((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement('script');
    let readinessTimer: number | undefined;
    const finish = () => {
      if (!window.google?.maps) return false;
      window.clearTimeout(timeout);
      if (readinessTimer) window.clearInterval(readinessTimer);
      resolve(window.google.maps);
      return true;
    };
    const timeout = window.setTimeout(() => {
      if (readinessTimer) window.clearInterval(readinessTimer);
      reject(new Error('Google Maps timed out.'));
    }, 12000);
    window.__railsetuGoogleMapsReady = () => { finish(); };
    script.addEventListener('load', () => {
      if (finish()) return;
      readinessTimer = window.setInterval(finish, 50);
    }, { once: true });
    script.addEventListener('error', () => {
      window.clearTimeout(timeout);
      if (readinessTimer) window.clearInterval(readinessTimer);
      reject(new Error('Google Maps could not be loaded.'));
    }, { once: true });
    if (!existing) {
      script.id = GOOGLE_MAPS_SCRIPT_ID;
      script.async = true;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&callback=__railsetuGoogleMapsReady`;
      document.head.appendChild(script);
    } else if (!finish()) {
      readinessTimer = window.setInterval(finish, 50);
    }
  }).catch((error) => {
    window.__railsetuGoogleMapsPromise = undefined;
    throw error;
  });
  return window.__railsetuGoogleMapsPromise;
}

const lightMapStyles = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ saturation: -70 }, { lightness: 18 }] },
  { featureType: 'water', stylers: [{ color: '#cbdcf2' }] },
  { featureType: 'landscape', stylers: [{ color: '#edf2f8' }] },
];
const darkMapStyles = [
  { elementType: 'geometry', stylers: [{ color: '#111a2f' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9aa8c4' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#111a2f' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#25324a' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#091426' }] },
];

function escapeMapText(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

function GoogleRouteMap({ points, solution, onFailure }: { points: MapPoint[]; solution: JourneySolution; onFailure: () => void }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
    if (!canvas || !apiKey) { onFailure(); return; }
    let disposed = false;
    const cleanups: Array<() => void> = [];
    const initialise = async () => {
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          return await loadGoogleMaps(apiKey);
        } catch (error) {
          lastError = error;
          if (disposed || attempt === 1) break;
          document.getElementById(GOOGLE_MAPS_SCRIPT_ID)?.remove();
          window.__railsetuGoogleMapsPromise = undefined;
          await new Promise((resolve) => window.setTimeout(resolve, 250));
        }
      }
      throw lastError;
    };
    initialise().then((maps) => {
      if (disposed) return;
      const dark = document.documentElement.classList.contains('railsetu-dark');
      const map = new maps.Map(canvas, {
        center: { lat: points[0].latitude, lng: points[0].longitude },
        zoom: 6,
        styles: dark ? darkMapStyles : lightMapStyles,
        backgroundColor: dark ? '#111a2f' : '#edf2f8',
        clickableIcons: false,
        fullscreenControl: false,
        mapTypeControl: false,
        streetViewControl: false,
        gestureHandling: 'greedy',
      });
      const bounds = new maps.LatLngBounds();
      const infoWindows: GoogleInfoWindow[] = [];
      points.forEach((point, index) => {
        const position = { lat: point.latitude, lng: point.longitude };
        bounds.extend(position);
        const role = index === 0 ? 'Board' : index === points.length - 1 ? 'Arrive' : 'Seat change';
        const marker = new maps.Marker({
          map,
          position,
          title: `${point.name} (${point.code}) · ${role} at ${point.time}`,
          label: { text: String(index + 1), color: '#ffffff', fontSize: '10px', fontWeight: '700' },
          icon: {
            path: 'M12 2C7.6 2 4 5.6 4 10c0 5.7 8 12 8 12s8-6.3 8-12c0-4.4-3.6-8-8-8z',
            fillColor: segmentColors[Math.max(0, index - 1) % segmentColors.length],
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: index > 0 && index < points.length - 1 ? 3 : 2,
            scale: index > 0 && index < points.length - 1 ? 1.35 : 1.15,
            anchor: { x: 12, y: 22 },
            labelOrigin: { x: 12, y: 10 },
          },
        });
        const inbound = index > 0 ? solution.legs[index - 1] : solution.legs[0];
        const info = new maps.InfoWindow({ content: `<div class="railsetu-map-info"><small>${escapeMapText(role)}</small><strong>${escapeMapText(point.name)}</strong><span>${escapeMapText(point.code)} · ${escapeMapText(point.time)}</span>${inbound ? `<b>${escapeMapText(inbound.coach)} · ${escapeMapText(inbound.seat)} ${escapeMapText(inbound.berth)}</b>` : ''}</div>` });
        infoWindows.push(info);
        marker.addListener('click', () => {
          infoWindows.forEach((window) => window.close());
          info.open({ anchor: marker, map });
        });
        cleanups.push(() => marker.setMap(null));
      });
      points.slice(0, -1).forEach((point, index) => {
        const next = points[index + 1];
        const shadow = new maps.Polyline({ map, path: [{ lat: point.latitude, lng: point.longitude }, { lat: next.latitude, lng: next.longitude }], geodesic: true, strokeColor: dark ? '#080d19' : '#ffffff', strokeOpacity: .72, strokeWeight: 10 });
        const line = new maps.Polyline({ map, path: [{ lat: point.latitude, lng: point.longitude }, { lat: next.latitude, lng: next.longitude }], geodesic: true, strokeColor: segmentColors[index % segmentColors.length], strokeOpacity: .95, strokeWeight: 6 });
        cleanups.push(() => shadow.setMap(null), () => line.setMap(null));
      });
      map.fitBounds(bounds, 72);
      const themeObserver = new MutationObserver(() => {
        const isDark = document.documentElement.classList.contains('railsetu-dark');
        map.setOptions({ styles: isDark ? darkMapStyles : lightMapStyles, backgroundColor: isDark ? '#111a2f' : '#edf2f8' });
      });
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      cleanups.push(() => themeObserver.disconnect());
      setLoading(false);
    }).catch(() => { if (!disposed) onFailure(); });
    return () => { disposed = true; cleanups.forEach((cleanup) => cleanup()); };
  }, [onFailure, points, solution]);

  return <div className="journey-map-google-shell"><div ref={canvasRef} className="journey-map-google" role="group" aria-label="Interactive Google map of the selected RailSetu journey" />{loading ? <div className="journey-map-loading" role="status"><i /> Loading Google route map…</div> : null}</div>;
}

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
  const [googleMapFailed, setGoogleMapFailed] = useState(false);
  const useFallbackMap = useCallback(() => setGoogleMapFailed(true), []);
  const mapPoints = useMemo(() => {
    const rawStops = solution.legs.length ? [solution.legs[0].from, ...solution.legs.map((leg) => leg.to)] : [];
    return rawStops.flatMap((stop) => {
      const coordinate = stationByCode.get(stop.code);
      return coordinate ? [{ ...stop, ...coordinate }] : [];
    });
  }, [solution]);

  useEffect(() => { if (open) setGoogleMapFailed(false); }, [open, solution.id]);

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
          {googleMapFailed || !process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
            ? <RouteMap points={mapPoints} />
            : <GoogleRouteMap points={mapPoints} solution={solution} onFailure={useFallbackMap} />}
          <aside className="journey-map-legend" aria-label="Seat segments">
            <span className="mini-label">Seat segments</span>
            <h3>{solution.passengerJourneys.length > 1 ? `${solution.passengerJourneys.length} passengers. One coordinated route.` : `One train. ${solution.legs.length} confirmed seats.`}</h3>
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
