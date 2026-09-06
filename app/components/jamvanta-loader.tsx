'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

const Jamvanta = dynamic(() => import('./jamvanta'), { ssr: false });

export default function JamvantaLoader() {
  const pathname = usePathname();
  if (!pathname || pathname === '/' || pathname === '/about' || pathname.startsWith('/about/')) return null;
  return <Jamvanta />;
}
