import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';

type TactileGlareLinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
  wrapperClassName?: string;
  baseColor: string;
  depth?: number;
  glareOpacity?: number;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

type EffectVariables = CSSProperties & {
  '--tactile-depth': string;
  '--tactile-base': string;
  '--glare-opacity': number;
};

export default function TactileGlareLink({
  href,
  children,
  className = '',
  wrapperClassName = '',
  baseColor,
  depth = 7,
  glareOpacity = 0.32,
  onClick,
}: TactileGlareLinkProps) {
  const style: EffectVariables = {
    '--tactile-depth': `${depth}px`,
    '--tactile-base': baseColor,
    '--glare-opacity': glareOpacity,
  };

  return (
    <span className={`tactile-wrap ${wrapperClassName}`} style={style}>
      <span className="tactile-base" aria-hidden="true" />
      <a className={`tactile-cap glare-surface ${className}`} href={href} onClick={onClick}>
        {children}
      </a>
    </span>
  );
}
