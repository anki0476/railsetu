'use client';

import { QRCodeSVG } from 'qrcode.react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef } from 'react';

type TicketLeg = {
  from: string;
  departure: string;
  to: string;
  arrival: string;
  coach: string;
  seat: string;
  berth: string;
};

const canonicalOrigin = 'https://railsetu-waitlist.beatkingkrrish9500.chatgpt.site';

const clamp = (value: number, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));

function smoothstep(edge0: number, edge1: number, value: number) {
  const progress = clamp((value - edge0) / (edge1 - edge0 || 1));
  return progress * progress * (3 - 2 * progress);
}

function clean(value: string | null, fallback: string, maximum = 80) {
  return (value?.trim() || fallback).slice(0, maximum);
}

function parseLegs(value: string | null): TicketLeg[] {
  if (!value) return [];
  return value.split('|').slice(0, 4).flatMap((entry) => {
    const [from, departure, to, arrival, coach, seat, berth] = entry.split('~');
    if (!from || !to || !coach || !seat) return [];
    return [{ from, departure, to, arrival, coach, seat, berth }];
  });
}

function paymentLabel(mode: string) {
  if (mode === 'visa') return 'Visa •••• 6756';
  if (mode === 'mastercard') return 'Mastercard •••• 4632';
  return 'UPI · railsetu@upi';
}

export default function ScrollExpandTicket() {
  const params = useSearchParams();
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const ticketRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);

  const fareValue = Number(params.get('fare'));
  const fare = Number.isFinite(fareValue) && fareValue > 0 ? fareValue : 1440;
  const fareLabel = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(fare);
  const train = clean(params.get('train'), '12310 · Magadh Express');
  const from = clean(params.get('from'), 'NDLS', 8);
  const fromName = clean(params.get('fromName'), 'New Delhi');
  const to = clean(params.get('to'), 'PNBE', 8);
  const toName = clean(params.get('toName'), 'Patna Junction');
  const date = clean(params.get('date'), '2026-08-30', 12);
  const travelClass = clean(params.get('class'), '3A', 8);
  const comfort = clean(params.get('comfort'), '89', 3);
  const profile = clean(params.get('profile'), 'elderly', 20);
  const mode = clean(params.get('mode'), 'upi', 16);
  const legs = useMemo(() => parseLegs(params.get('legs')), [params]);
  const ticketId = `RS-${train.split('·')[0].trim()}-${from}${to}-${date.replaceAll('-', '')}`;

  const downloadParams = useMemo(() => {
    const next = new URLSearchParams();
    ['fare', 'train', 'from', 'fromName', 'to', 'toName', 'date', 'class', 'comfort', 'profile', 'mode', 'legs'].forEach((key) => {
      const value = params.get(key);
      if (value) next.set(key, value);
    });
    return next.toString();
  }, [params]);
  const downloadPath = `/api/ticket?${downloadParams}`;
  const qrValue = `${canonicalOrigin}${downloadPath}`;

  const applyProgress = useCallback((progress: number) => {
    const stage = stageRef.current;
    const frame = frameRef.current;
    const qr = qrRef.current;
    const ticket = ticketRef.current;
    if (!stage || !frame || !qr || !ticket) return;

    const eased = smoothstep(0, 1, progress);
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const compactSize = clamp(Math.min(width * 0.48, height * 0.45), 218, 318);
    const compactHorizontal = Math.max(0, (width - compactSize) / 2);
    const compactVertical = Math.max(0, (height - compactSize) / 2);
    const expandedHorizontal = width < 760 ? 14 : Math.max(34, width * 0.045);
    const expandedVertical = width < 760 ? 28 : Math.max(42, height * 0.075);
    const horizontalInset = compactHorizontal + (expandedHorizontal - compactHorizontal) * eased;
    const verticalInset = compactVertical + (expandedVertical - compactVertical) * eased;
    const radius = 30 + (22 - 30) * eased;

    frame.style.clipPath = `inset(${verticalInset}px ${horizontalInset}px round ${radius}px)`;
    frame.style.boxShadow = `0 ${18 + 24 * eased}px ${55 + 65 * eased}px rgba(42, 61, 126, ${0.16 + 0.08 * eased})`;

    const qrOut = smoothstep(0.07, 0.43, progress);
    qr.style.opacity = String(1 - qrOut);
    qr.style.transform = `scale(${1 - qrOut * 0.08})`;

    const ticketIn = smoothstep(0.34, 0.94, progress);
    ticket.style.opacity = String(ticketIn);
    ticket.style.transform = `translate3d(0, ${24 * (1 - ticketIn)}px, 0) scale(${0.985 + 0.015 * ticketIn})`;

    if (hintRef.current) {
      const hintOut = smoothstep(0, 0.18, progress);
      hintRef.current.style.opacity = String(1 - hintOut);
      hintRef.current.style.transform = `translateY(${8 * hintOut}px)`;
    }
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    const stage = stageRef.current;
    if (!root || !track || !stage) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frameId = 0;
    let current = 0;
    let target = 0;
    let running = false;

    const measure = () => {
      stage.style.height = `${window.innerHeight}px`;
      track.style.height = `${window.innerHeight * 2.15}px`;
      target = clamp(-track.getBoundingClientRect().top / (window.innerHeight * 0.9));
      if (reduceMotion) current = target;
      applyProgress(current);
    };

    const tick = () => {
      current += (target - current) * 0.12;
      if (Math.abs(target - current) < 0.0005) {
        current = target;
        running = false;
      }
      applyProgress(current);
      frameId = running ? requestAnimationFrame(tick) : 0;
    };

    const onScroll = () => {
      target = clamp(-track.getBoundingClientRect().top / (window.innerHeight * 0.9));
      if (reduceMotion) {
        current = target;
        applyProgress(current);
        return;
      }
      if (!running) {
        running = true;
        frameId = requestAnimationFrame(tick);
      }
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
    };
  }, [applyProgress]);

  return (
    <div ref={rootRef} className="ticket-scroll-expand">
      <div ref={trackRef} className="ticket-scroll-track">
        <div ref={stageRef} className="ticket-scroll-stage">
          <span className="ticket-reveal-ambient ticket-reveal-ambient-one" aria-hidden="true" />
          <span className="ticket-reveal-ambient ticket-reveal-ambient-two" aria-hidden="true" />

          <div ref={frameRef} className="ticket-expand-frame">
            <div ref={qrRef} className="ticket-qr-layer">
              <a href={downloadPath} download aria-label="Download your RailSetu mock ticket">
                <QRCodeSVG value={qrValue} size={236} level="M" marginSize={2} bgColor="#ffffff" fgColor="#11172d" title="Scan to download your RailSetu mock ticket" />
              </a>
            </div>

            <div ref={ticketRef} className="ticket-detail-layer">
              <article className="rail-ticket" aria-labelledby="rail-ticket-title">
                <header className="rail-ticket-header">
                  <div className="rail-ticket-brand"><span className="brand-mark" aria-hidden="true"><i /><i /></span><strong>RailSetu</strong></div>
                  <div className="rail-ticket-status"><i /> Confirmed throughout</div>
                </header>

                <div className="rail-ticket-route">
                  <div><span>{fromName}</span><strong>{from}</strong></div>
                  <div className="rail-ticket-route-line"><i /><span>{train}</span><i /></div>
                  <div><span>{toName}</span><strong>{to}</strong></div>
                </div>

                <div className="rail-ticket-meta">
                  <div><span>Journey date</span><strong>{date}</strong></div>
                  <div><span>Class</span><strong>{travelClass}</strong></div>
                  <div><span>Comfort score</span><strong>{comfort} / 100</strong></div>
                  <div><span>Total fare</span><strong>{fareLabel}</strong></div>
                </div>

                <section className="rail-ticket-legs" aria-label="Confirmed ticket segments">
                  <div className="rail-ticket-section-title"><span>Confirmed segments</span><small>{legs.length || 2} tickets · one connected journey</small></div>
                  {(legs.length ? legs : [
                    { from: 'NDLS', departure: '20:10', to: 'CNB', arrival: '01:05', coach: 'B2', seat: '34', berth: 'LB' },
                    { from: 'CNB', departure: '01:05', to: 'PNBE', arrival: '09:40', coach: 'B2', seat: '41', berth: 'SL' },
                  ]).map((leg, index) => (
                    <div className="rail-ticket-leg" key={`${leg.from}-${leg.to}-${leg.seat}`}>
                      <span>0{index + 1}</span>
                      <div><strong>{leg.from}</strong><small>{leg.departure}</small></div>
                      <i>→</i>
                      <div><strong>{leg.to}</strong><small>{leg.arrival}</small></div>
                      <div className="rail-ticket-seat"><small>Confirmed seat</small><strong>{leg.coach} · {leg.seat} {leg.berth}</strong></div>
                    </div>
                  ))}
                </section>

                <footer className="rail-ticket-footer">
                  <div><span>Ticket ID</span><strong id="rail-ticket-title">{ticketId}</strong></div>
                  <div><span>Traveller plan</span><strong>{profile === 'elderly' ? 'Limited mobility' : profile}</strong></div>
                  <div><span>Mock payment</span><strong>{paymentLabel(mode)}</strong></div>
                  <a href={downloadPath} download>Download mock ticket <span>↓</span></a>
                </footer>
              </article>
            </div>
          </div>

          <div ref={hintRef} className="ticket-scroll-hint" aria-hidden="true">
            <span>Scroll to reveal your ticket</span><i>↓</i>
          </div>
        </div>
      </div>
    </div>
  );
}
