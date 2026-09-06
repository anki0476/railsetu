'use client';

import { motion, useAnimation, useReducedMotion, type Variants } from 'framer-motion';
import { useCallback, useEffect, type HTMLAttributes } from 'react';

type AnimatedIconProps = Omit<HTMLAttributes<HTMLSpanElement>, 'color'> & {
  size?: number;
  duration?: number;
  color?: string;
  active?: boolean;
};

function useHoverAnimation(active?: boolean) {
  const controls = useAnimation();
  const reducedMotion = useReducedMotion();
  const start = useCallback(() => {
    if (!reducedMotion) void controls.start('animate');
  }, [controls, reducedMotion]);
  const stop = useCallback(() => {
    void controls.start('normal');
  }, [controls]);
  useEffect(() => {
    if (active) start();
    else if (active === false) stop();
  }, [active, start, stop]);
  return { controls, start, stop, reducedMotion };
}

function IconShell({ className, color, style, active: _active, onMouseEnter, onMouseLeave, children, ...props }: AnimatedIconProps) {
  void _active;
  return <span className={className} style={{ color, ...style }} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} {...props}>{children}</span>;
}

export function WalletIcon({ size = 18, duration = 1, active, ...props }: AnimatedIconProps) {
  const { controls, start, stop } = useHoverAnimation(active);
  const body: Variants = { normal: { strokeDashoffset: 0, opacity: 1 }, animate: { strokeDashoffset: [80, 0], opacity: [.4, 1], transition: { duration: .8 * duration, ease: 'easeInOut' } } };
  const flap: Variants = { normal: { rotate: 0 }, animate: { rotate: [-6, 0, -3, 0], transition: { duration: .9 * duration, ease: 'easeInOut', delay: .2 } } };
  const swipe: Variants = { normal: { x: 0, opacity: 0 }, animate: { x: [0, 6, 0], opacity: [0, 1, 0], transition: { duration: .8 * duration, ease: 'easeInOut', delay: .45 } } };
  return <IconShell {...props} onMouseEnter={start} onMouseLeave={stop}>
    <motion.svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <motion.path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" strokeDasharray="80" variants={body} initial="normal" animate={controls} />
      <motion.g variants={flap} initial="normal" animate={controls} style={{ transformBox: 'view-box', transformOrigin: '10% 50%' }}><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /></motion.g>
      <motion.line x1="14" y1="12" x2="18" y2="12" variants={swipe} initial="normal" animate={controls} />
    </motion.svg>
  </IconShell>;
}

export function LogInIcon({ size = 18, duration = 1, active, ...props }: AnimatedIconProps) {
  const { controls, start, stop } = useHoverAnimation(active);
  const icon: Variants = { normal: { scale: 1, rotate: 0 }, animate: { scale: [1, 1.1, .95, 1], rotate: [0, -3, 2, 0], transition: { duration: .9 * duration, ease: 'easeInOut' } } };
  const arrow: Variants = { normal: { x: 0, opacity: 1 }, animate: { x: [-8, 2, 0], opacity: [0, 1, 1], transition: { duration: .6 * duration, ease: 'easeOut' } } };
  const door: Variants = { normal: { pathLength: 1 }, animate: { pathLength: [0, 1], transition: { duration: .7 * duration, ease: 'easeInOut', delay: .1 } } };
  return <IconShell {...props} onMouseEnter={start} onMouseLeave={stop}>
    <motion.svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" variants={icon} initial="normal" animate={controls} aria-hidden="true">
      <motion.path d="m10 17 5-5-5-5" variants={arrow} /><motion.path d="M15 12H3" variants={arrow} /><motion.path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" variants={door} />
    </motion.svg>
  </IconShell>;
}

export function SlidersHorizontalIcon({ size = 18, duration = 1, active, ...props }: AnimatedIconProps) {
  const { controls, start, stop } = useHoverAnimation(active);
  const track: Variants = { normal: { opacity: 1 }, animate: { opacity: [1, .6, 1], transition: { duration: .6 * duration, ease: 'easeInOut' } } };
  const knob: Variants = { normal: { x: 0 }, animate: (direction: number) => ({ x: [0, direction * 3, 0], transition: { duration: .7 * duration, ease: 'easeInOut', delay: Math.abs(direction) * .05 } }) };
  return <IconShell {...props} onMouseEnter={start} onMouseLeave={stop}>
    <motion.svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {['M10 5H3', 'M21 5h-7', 'M12 19H3', 'M21 19h-5', 'M21 12h-9', 'M8 12H3'].map((d) => <motion.path key={d} d={d} variants={track} initial="normal" animate={controls} />)}
      <motion.path d="M14 3v4" variants={knob} custom={1} initial="normal" animate={controls} /><motion.path d="M16 17v4" variants={knob} custom={-1} initial="normal" animate={controls} /><motion.path d="M8 10v4" variants={knob} custom={1} initial="normal" animate={controls} />
    </motion.svg>
  </IconShell>;
}

export function InfoIcon({ size = 11, duration = 1, active, ...props }: AnimatedIconProps) {
  const { controls, start, stop } = useHoverAnimation(active);
  const ring: Variants = { normal: { pathLength: 1, rotate: 0 }, animate: { pathLength: [0, 1], rotate: [0, 8, 0], transition: { duration: .7 * duration, ease: 'easeInOut' } } };
  const mark: Variants = { normal: { y: 0, opacity: 1 }, animate: { y: [3, -1, 0], opacity: [0, 1, 1], transition: { duration: .55 * duration, delay: .18 } } };
  return <IconShell {...props} onMouseEnter={start} onMouseLeave={stop}>
    <motion.svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <motion.circle cx="12" cy="12" r="9" variants={ring} initial="normal" animate={controls} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
      <motion.path d="M12 11v5M12 8h.01" variants={mark} initial="normal" animate={controls} />
    </motion.svg>
  </IconShell>;
}

export function ScanLineIcon({ size = 18, duration = 1, ...props }: AnimatedIconProps) {
  const controls = useAnimation();
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (!reducedMotion) void controls.start('animate');
    return () => controls.stop();
  }, [controls, reducedMotion]);
  const corner: Variants = { normal: { scale: 1, opacity: 1 }, animate: (index: number) => ({ scale: [0, 1.12, 1], opacity: [0, 1, 1], transition: { duration: .4 * duration, delay: (.05 + index * .07) * duration, repeat: Infinity, repeatDelay: .7 * duration } }) };
  const line: Variants = { normal: { y: 0 }, animate: { y: [0, -6, 6, 0], transition: { duration: 1.1 * duration, delay: .4 * duration, ease: 'easeInOut', repeat: Infinity, repeatDelay: .35 * duration } } };
  const corners = ['M3 7V5a2 2 0 0 1 2-2h2', 'M17 3h2a2 2 0 0 1 2 2v2', 'M21 17v2a2 2 0 0 1-2 2h-2', 'M7 21H5a2 2 0 0 1-2-2v-2'];
  return <IconShell {...props}><motion.svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {corners.map((d, index) => <motion.path key={d} d={d} custom={index} variants={corner} initial="normal" animate={controls} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />)}
    <motion.path d="M7 12h10" variants={line} initial="normal" animate={controls} />
  </motion.svg></IconShell>;
}

export function UploadIcon({ size = 18, duration = 1, active, ...props }: AnimatedIconProps) {
  const { controls, start, stop } = useHoverAnimation(active);
  const shaft: Variants = { normal: { strokeDashoffset: 0, opacity: 1 }, animate: { strokeDashoffset: [30, 0], opacity: [.4, 1], transition: { duration: .6 * duration, ease: 'easeInOut' } } };
  const head: Variants = { normal: { y: 0, opacity: 1, scale: 1 }, animate: { y: [2, -2, 0], scale: [1, 1.05, 1], opacity: [.6, 1], transition: { duration: .6 * duration, ease: 'easeInOut', delay: .05 } } };
  const tray: Variants = { normal: { strokeDashoffset: 0, opacity: 1 }, animate: { strokeDashoffset: [60, 0], opacity: [.3, 1], transition: { duration: .6 * duration, ease: 'easeInOut', delay: .1 } } };
  return <IconShell {...props} onMouseEnter={start} onMouseLeave={stop}><motion.svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <motion.path d="M12 3v12" strokeDasharray="30" variants={shaft} initial="normal" animate={controls} /><motion.path d="m17 8-5-5-5 5" variants={head} initial="normal" animate={controls} /><motion.path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeDasharray="60" variants={tray} initial="normal" animate={controls} />
  </motion.svg></IconShell>;
}

export function CameraIcon({ size = 18, duration = 1, active, ...props }: AnimatedIconProps) {
  const { controls, start, stop } = useHoverAnimation(active);
  const lens: Variants = { normal: { scale: 1 }, animate: { scale: [1, .45, 1.15, 1], transition: { duration: .8 * duration, ease: [.34, 1.4, .64, 1] } } };
  return <IconShell {...props} onMouseEnter={start} onMouseLeave={stop}><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" /><motion.circle cx="12" cy="13" r="3" variants={lens} initial="normal" animate={controls} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
  </svg></IconShell>;
}

export function HandCoinsIcon({ size = 18, duration = 1, active, ...props }: AnimatedIconProps) {
  const groupControls = useAnimation();
  const coinsControls = useAnimation();
  const handControls = useAnimation();
  const reducedMotion = useReducedMotion();
  const start = useCallback(() => {
    if (reducedMotion) return;
    void groupControls.start('animate');
    void coinsControls.start('animate');
    void handControls.start('animate');
  }, [coinsControls, groupControls, handControls, reducedMotion]);
  const stop = useCallback(() => {
    void groupControls.start('normal');
    void coinsControls.start('normal');
    void handControls.start('normal');
  }, [coinsControls, groupControls, handControls]);
  useEffect(() => { if (active) start(); else if (active === false) stop(); }, [active, start, stop]);
  const group: Variants = { normal: { scale: 1, rotate: 0 }, animate: { scale: [1, 1.06, .98, 1], rotate: [0, -2, 1, 0], transition: { duration: .9 * duration, ease: [.22, 1, .36, 1] } } };
  const coins: Variants = { normal: { scale: 1, opacity: 1, y: 0 }, animate: { scale: [.7, 1.02, 1], opacity: [0, 1, 1], y: [-6, 0], transition: { duration: .6 * duration, ease: 'easeOut', delay: .1 } } };
  const hand: Variants = { normal: { pathLength: 1, opacity: 1, y: 0 }, animate: { pathLength: [0, 1], opacity: [.5, 1], y: [2, 0], transition: { duration: .9 * duration, ease: 'easeInOut', delay: .2 } } };
  return <IconShell {...props} active={active} onMouseEnter={start} onMouseLeave={stop}><motion.svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" initial="normal" animate={groupControls} variants={group} aria-hidden="true">
    <motion.path d="M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17" initial="normal" animate={handControls} variants={hand} /><motion.path d="m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9" initial="normal" animate={handControls} variants={hand} /><motion.path d="m2 16 6 6" initial="normal" animate={handControls} variants={hand} /><motion.circle cx="16" cy="9" r="2.9" initial="normal" animate={coinsControls} variants={coins} /><motion.circle cx="6" cy="5" r="3" initial="normal" animate={coinsControls} variants={coins} />
  </motion.svg></IconShell>;
}
