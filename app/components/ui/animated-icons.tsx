'use client';

import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

type AnimatedIconProps = Omit<HTMLAttributes<HTMLSpanElement>, 'color'> & { size?: number; duration?: number; color?: string; active?: boolean };

function IconShell({ className = '', color, style, active, duration = 1, children, ...props }: AnimatedIconProps & { children: ReactNode }) {
  return <span className={`railsetu-animated-icon ${active ? 'is-active' : ''} ${className}`} style={{ color, '--icon-duration': `${duration}s`, ...style } as CSSProperties} {...props}>{children}</span>;
}

const svgProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

export function WalletIcon({ size = 18, ...props }: AnimatedIconProps) {
  return <IconShell {...props}><svg {...svgProps} width={size} height={size} className="icon-wallet"><path className="icon-draw" d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /><g className="icon-flap"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /></g><line className="icon-swipe" x1="14" y1="12" x2="18" y2="12" /></svg></IconShell>;
}

export function LogInIcon({ size = 18, ...props }: AnimatedIconProps) {
  return <IconShell {...props}><svg {...svgProps} width={size} height={size} className="icon-login"><g className="icon-login-arrow"><path d="m10 17 5-5-5-5" /><path d="M15 12H3" /></g><path className="icon-login-door" d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /></svg></IconShell>;
}

export function SlidersHorizontalIcon({ size = 18, ...props }: AnimatedIconProps) {
  return <IconShell {...props}><svg {...svgProps} width={size} height={size} className="icon-sliders"><g className="icon-tracks"><path d="M10 5H3" /><path d="M21 5h-7" /><path d="M12 19H3" /><path d="M21 19h-5" /><path d="M21 12h-9" /><path d="M8 12H3" /></g><path className="icon-knob icon-knob-a" d="M14 3v4" /><path className="icon-knob icon-knob-b" d="M16 17v4" /><path className="icon-knob icon-knob-c" d="M8 10v4" /></svg></IconShell>;
}

export function InfoIcon({ size = 11, ...props }: AnimatedIconProps) {
  return <IconShell {...props}><svg {...svgProps} width={size} height={size} className="icon-info"><circle className="icon-info-ring" cx="12" cy="12" r="9" /><path className="icon-info-mark" d="M12 11v5M12 8h.01" /></svg></IconShell>;
}

export function ScanLineIcon({ size = 18, ...props }: AnimatedIconProps) {
  return <IconShell {...props} active><svg {...svgProps} width={size} height={size} className="icon-scan"><g className="icon-scan-corners"><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /></g><path className="icon-scan-line" d="M7 12h10" /></svg></IconShell>;
}

export function UploadIcon({ size = 18, ...props }: AnimatedIconProps) {
  return <IconShell {...props}><svg {...svgProps} width={size} height={size} className="icon-upload"><path className="icon-upload-shaft" d="M12 3v12" /><path className="icon-upload-head" d="m17 8-5-5-5 5" /><path className="icon-upload-tray" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /></svg></IconShell>;
}

export function CameraIcon({ size = 18, ...props }: AnimatedIconProps) {
  return <IconShell {...props}><svg {...svgProps} width={size} height={size} className="icon-camera"><path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" /><circle className="icon-camera-lens" cx="12" cy="13" r="3" /></svg></IconShell>;
}

export function HandCoinsIcon({ size = 18, ...props }: AnimatedIconProps) {
  return <IconShell {...props}><svg {...svgProps} width={size} height={size} className="icon-hand-coins"><g className="icon-hand"><path d="M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17" /><path d="m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9" /><path d="m2 16 6 6" /></g><g className="icon-coins"><circle cx="16" cy="9" r="2.9" /><circle cx="6" cy="5" r="3" /></g></svg></IconShell>;
}
