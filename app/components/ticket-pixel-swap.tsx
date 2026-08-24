import type { CSSProperties } from 'react';

const columns = 10;
const rows = 6;

type PixelStyle = CSSProperties & {
  '--pixel-delay': string;
};

const pixels = Array.from({ length: columns * rows }, (_, index) => {
  const column = index % columns;
  const row = Math.floor(index / columns);
  const order = (index * 17) % (columns * rows);

  const style: PixelStyle = {
    '--pixel-delay': `${order * 12}ms`,
    backgroundImage: "url('/tickets/confirmed.png')",
    backgroundSize: `${columns * 100}% ${rows * 100}%`,
    backgroundPosition: `${(column / (columns - 1)) * 100}% ${(row / (rows - 1)) * 100}%`,
  };

  return { index, style };
});

export default function TicketPixelSwap() {
  return (
    <section className="ticket-story-wrap" aria-labelledby="ticket-story-title">
      <div className="ticket-story-copy">
        <div>
          <span className="mini-label">The RailSetu switch</span>
          <h2 id="ticket-story-title">One waitlist. One hidden path.</h2>
        </div>
        <p><span aria-hidden="true">✦</span> Hover or focus the ticket to reveal it</p>
      </div>

      <figure
        className="ticket-pixel-swap"
        tabIndex={0}
        aria-label="A waitlisted direct New Delhi to Patna ticket transforms into a confirmed journey on the same train, with a seat change at Kanpur Junction."
      >
        <img
          className="ticket-image ticket-image-waitlist"
          src="/tickets/waitlist.png"
          alt=""
          loading="lazy"
          decoding="async"
        />
        <span className="ticket-state ticket-state-before" aria-hidden="true">Direct · Waitlisted</span>
        <div className="ticket-pixel-grid" aria-hidden="true">
          {pixels.map(({ index, style }) => (
            <i className="ticket-pixel" key={index} style={style} />
          ))}
        </div>
        <span className="ticket-state ticket-state-after" aria-hidden="true">Same train · Confirmed in segments</span>
      </figure>
    </section>
  );
}
