'use client';

import { useEffect, useState } from 'react';

const names = ['RailSetu', 'रेलसेतु'];

export default function BrandTextType() {
  const [nameIndex, setNameIndex] = useState(0);
  const [length, setLength] = useState(names[0].length);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const name = names[nameIndex];
    const complete = length === name.length;
    const empty = length === 0;
    const delay = complete && !deleting ? 1900 : empty && deleting ? 260 : deleting ? 55 : 92;

    const timer = window.setTimeout(() => {
      if (complete && !deleting) {
        setDeleting(true);
        return;
      }

      if (empty && deleting) {
        setNameIndex((value) => (value + 1) % names.length);
        setDeleting(false);
        setLength(0);
        return;
      }

      setLength((value) => value + (deleting ? -1 : 1));
    }, delay);

    return () => window.clearTimeout(timer);
  }, [deleting, length, nameIndex]);

  return (
    <span className="brand-type" aria-hidden="true">
      <span>{names[nameIndex].slice(0, length)}</span>
      <i className="brand-type-cursor" />
    </span>
  );
}
