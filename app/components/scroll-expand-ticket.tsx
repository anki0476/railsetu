'use client';

import { QRCodeSVG } from 'qrcode.react';
import { ColorPanels } from '@paper-design/shaders-react';
import { useSearchParams } from 'next/navigation';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import BrandMark from './brand-mark';
import TactileGlareLink from './tactile-glare-link';
import { registerTicketInHistory } from '../lib/ticket-history';

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
const MemoizedColorPanels = memo(ColorPanels);

const ticketLoaderShaderProps = {
  width: 720,
  height: 420,
  colors: ['#5f7fe8', '#a58cf3', '#d9ebff', '#789fff'],
  colorBack: '#070b1700',
  density: 5.03,
  angle1: 0.68,
  angle2: 0.28,
  length: 1.13,
  edges: true,
  blur: 0.25,
  fadeIn: 0.85,
  fadeOut: 0.3,
  gradient: 0.56,
  speed: 3.2,
  scale: 0.96,
  rotation: 180,
};

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
  const [ticketLoadPhase, setTicketLoadPhase] = useState<'loading' | 'revealing' | 'ready'>('loading');
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

  useEffect(() => {
    if (ticketLoadPhase !== 'ready') return;
    registerTicketInHistory({
      id: ticketId,
      train,
      from,
      fromName,
      to,
      toName,
      journeyDate: date,
      purchasedAt: Date.now(),
      fare,
      ticketUrl: `/ticket?${downloadParams}`,
    });
  }, [date, downloadParams, fare, from, fromName, ticketId, ticketLoadPhase, to, toName, train]);

  useLayoutEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const revealAfter = reducedMotion ? 450 : 2350;
    const finishAfter = reducedMotion ? 650 : 2950;
    const previousOverflow = document.body.style.overflow;

    window.scrollTo(0, 0);
    document.body.style.overflow = 'hidden';
    document.documentElement.classList.add('railsetu-ticket-loading');
    const revealTimer = window.setTimeout(() => setTicketLoadPhase('revealing'), revealAfter);
    const finishTimer = window.setTimeout(() => {
      setTicketLoadPhase('ready');
      document.body.style.overflow = previousOverflow;
      document.documentElement.classList.remove('railsetu-ticket-loading');
    }, finishAfter);

    return () => {
      window.clearTimeout(revealTimer);
      window.clearTimeout(finishTimer);
      document.body.style.overflow = previousOverflow;
      document.documentElement.classList.remove('railsetu-ticket-loading');
    };
  }, []);

  const applyProgress = useCallback((progress: number) => {
    const stage = stageRef.current;
    const frame = frameRef.current;
    const qr = qrRef.current;
    const ticket = ticketRef.current;
    if (!stage || !frame || !qr || !ticket) return;
    const ticketCard = ticket.firstElementChild as HTMLElement | null;

    const eased = smoothstep(0, 1, progress);
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const compactSize = clamp(Math.min(width * 0.48, height * 0.45), 218, 318);
    const compactHorizontal = Math.max(0, (width - compactSize) / 2);
    const compactVertical = Math.max(0, (height - compactSize) / 2);
    const expandedHorizontal = 0;
    const expandedVertical = 0;
    const horizontalInset = compactHorizontal + (expandedHorizontal - compactHorizontal) * eased;
    const verticalInset = compactVertical + (expandedVertical - compactVertical) * eased;
    const radius = 30 * (1 - eased);

    frame.style.clipPath = `inset(${verticalInset}px ${horizontalInset}px round ${radius}px)`;
    frame.style.boxShadow = `0 ${18 + 18 * eased}px ${55 + 45 * eased}px rgba(42, 61, 126, ${0.16 * (1 - eased)})`;

    const qrOut = smoothstep(0.07, 0.43, progress);
    qr.style.opacity = String(1 - qrOut);
    qr.style.transform = `scale(${1 - qrOut * 0.08})`;

    const ticketIn = smoothstep(0.34, 0.94, progress);
    ticket.style.opacity = String(ticketIn);
    ticket.style.transform = `translate3d(0, ${24 * (1 - ticketIn)}px, 0) scale(${0.985 + 0.015 * ticketIn})`;
    ticket.style.padding = `${(width < 760 ? 14 : clamp(width * 0.04, 16, 54)) * (1 - eased)}px`;
    if (ticketCard) {
      ticketCard.style.borderRadius = `${(width < 760 ? 19 : 25) * (1 - eased)}px`;
      ticketCard.style.borderColor = `rgba(255, 255, 255, ${0.98 * (1 - eased)})`;
      ticketCard.style.boxShadow = `0 ${30 * (1 - eased)}px ${85 * (1 - eased)}px rgba(42, 61, 126, ${0.16 * (1 - eased)})`;
    }

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
          {ticketLoadPhase !== 'ready' ? (
            <div
              className={`ticket-color-loader ${ticketLoadPhase === 'revealing' ? 'is-revealing' : ''}`}
              role="status"
              aria-label="Preparing your confirmed RailSetu ticket"
            >
              <div className="ticket-color-loader-content">
                <div className="ticket-color-panels" aria-hidden="true">
                  <MemoizedColorPanels {...ticketLoaderShaderProps} />
                </div>
                <span className="ticket-loader-shimmer">Loading your ticket</span>
              </div>
            </div>
          ) : null}
          <TactileGlareLink
            className="ticket-back-home"
            wrapperClassName="ticket-back-wrap"
            href="/planner"
            baseColor="#aebfdf"
            depth={4}
            glareOpacity={0.2}
          >
            Back home <span>↙</span>
          </TactileGlareLink>

          <div ref={frameRef} className="ticket-expand-frame">
            <div ref={qrRef} className="ticket-qr-layer">
              <div className="ticket-qr-content">
                <div className="ticket-scan-label">
                  <span className="ticket-scan-icon" aria-hidden="true"><i /></span>
                  <span className="ticket-shiny-text">Scan to download ticket</span>
                </div>
                <a href={downloadPath} download aria-label="Download your RailSetu mock ticket">
                  <QRCodeSVG value={qrValue} size={236} level="M" marginSize={2} bgColor="#ffffff" fgColor="#11172d" title="Scan to download your RailSetu mock ticket" />
                </a>
                <div ref={hintRef} className="ticket-scroll-hint" aria-hidden="true">
                  <span className="ticket-shiny-text">Scroll to reveal your ticket</span><i>↓</i>
                </div>
              </div>
            </div>

            <div ref={ticketRef} className="ticket-detail-layer">
              <article className="rail-ticket" aria-labelledby="rail-ticket-title">
                <header className="rail-ticket-header">
                  <div className="rail-ticket-brand"><BrandMark /><strong>RailSetu</strong></div>
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
                  <a href={downloadPath} download>Download Ticket <span>↓</span></a>
                </footer>
              </article>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
