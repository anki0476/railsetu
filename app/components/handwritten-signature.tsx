'use client';

import { TegakiRenderer } from 'tegaki';
import caveat from 'tegaki/fonts/caveat';

const playback = {
  mode: 'uncontrolled' as const,
  speed: 1,
  loop: true,
  loopGap: 0.65,
};

export default function HandwrittenSignature() {
  return (
    <div className="handwritten-signature" aria-label="Built with love for Indians">
      <TegakiRenderer font={caveat} time={playback}>
        Built with
      </TegakiRenderer>
      <span className="handwritten-heart" aria-hidden="true">❤️</span>
      <TegakiRenderer font={caveat} time={playback}>
        for Indians
      </TegakiRenderer>
    </div>
  );
}
