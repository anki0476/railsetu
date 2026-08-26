type TicketLeg = {
  from: string;
  departure: string;
  to: string;
  arrival: string;
  coach: string;
  seat: string;
  berth: string;
};

function safe(value: string | null, fallback: string, maximum = 90) {
  return (value?.trim() || fallback).slice(0, maximum);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character] ?? character);
}

function parseLegs(value: string | null): TicketLeg[] {
  if (!value) return [];
  return value.split('|').slice(0, 4).flatMap((entry) => {
    const [from, departure, to, arrival, coach, seat, berth] = entry.split('~').map((part) => safe(part, '—', 20));
    if (!from || !to || !coach || !seat) return [];
    return [{ from, departure, to, arrival, coach, seat, berth }];
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fareValue = Number(searchParams.get('fare'));
  const fare = Number.isFinite(fareValue) && fareValue > 0 ? fareValue : 1440;
  const fareLabel = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(fare);
  const train = safe(searchParams.get('train'), '12310 · Magadh Express');
  const from = safe(searchParams.get('from'), 'NDLS', 8);
  const fromName = safe(searchParams.get('fromName'), 'New Delhi');
  const to = safe(searchParams.get('to'), 'PNBE', 8);
  const toName = safe(searchParams.get('toName'), 'Patna Junction');
  const date = safe(searchParams.get('date'), '2026-08-30', 12);
  const travelClass = safe(searchParams.get('class'), '3A', 8);
  const comfort = safe(searchParams.get('comfort'), '89', 3);
  const mode = safe(searchParams.get('mode'), 'UPI', 20).toUpperCase();
  const legs = parseLegs(searchParams.get('legs'));
  const shownLegs = legs.length ? legs : [
    { from: 'NDLS', departure: '20:10', to: 'CNB', arrival: '01:05', coach: 'B2', seat: '34', berth: 'LB' },
    { from: 'CNB', departure: '01:05', to: 'PNBE', arrival: '09:40', coach: 'B2', seat: '41', berth: 'SL' },
  ];
  const ticketId = `RS-${train.split('·')[0].trim()}-${from}${to}-${date.replaceAll('-', '')}`;

  const legMarkup = shownLegs.map((leg, index) => `
    <div class="leg">
      <b>0${index + 1}</b>
      <div><small>FROM</small><strong>${escapeHtml(leg.from)}</strong><span>${escapeHtml(leg.departure)}</span></div>
      <i>→</i>
      <div><small>TO</small><strong>${escapeHtml(leg.to)}</strong><span>${escapeHtml(leg.arrival)}</span></div>
      <div class="seat"><small>CONFIRMED SEAT</small><strong>${escapeHtml(leg.coach)} · ${escapeHtml(leg.seat)} ${escapeHtml(leg.berth)}</strong></div>
    </div>`).join('');

  const html = `<!doctype html>
<html lang="en-IN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>RailSetu Mock Ticket · ${escapeHtml(ticketId)}</title>
  <style>
    *{box-sizing:border-box}body{margin:0;padding:32px;background:#dcecff;color:#11131a;font-family:Arial,sans-serif}.ticket{max-width:820px;margin:auto;padding:30px;border:1px solid #fff;border-radius:26px;background:#f9fbff;box-shadow:0 28px 80px #3b518329}.top,.route,.meta,.foot{display:flex;align-items:center;justify-content:space-between;gap:20px}.brand{font-size:22px;font-weight:750}.status{padding:9px 12px;border-radius:999px;color:#24763d;background:#e7f7e9;font-size:12px}.route{margin:28px 0;padding:28px 0;border-block:1px solid #dce3f0}.place span,.place strong{display:block}.place span{color:#69758b;font-size:11px}.place strong{margin-top:7px;font-size:32px}.arrow{color:#5f72c9;font-size:28px}.meta{padding:0 0 24px}.meta div{flex:1}.meta small,.foot small,.leg small{display:block;color:#8790a2;font-size:9px;letter-spacing:.1em}.meta strong,.foot strong{display:block;margin-top:6px}.legs{border:1px solid #dfe5ef;border-radius:18px;overflow:hidden}.leg{display:grid;grid-template-columns:38px 1fr 28px 1fr 1.5fr;gap:14px;align-items:center;padding:18px}.leg+.leg{border-top:1px solid #dfe5ef}.leg>b{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;color:#5a70d2;background:#e8edff}.leg strong,.leg span{display:block}.leg strong{margin:5px 0 3px}.leg span{color:#667086;font-size:11px}.leg i{color:#5c70cc;font-style:normal}.seat{padding-left:18px;border-left:1px solid #dfe5ef}.foot{margin-top:24px;padding-top:22px;border-top:1px solid #dce3f0}.disclaimer{margin:22px 0 0;color:#838c9d;font-size:9px;text-align:center;text-transform:uppercase;letter-spacing:.08em}@media(max-width:640px){body{padding:14px}.ticket{padding:20px}.route{align-items:flex-end}.place strong{font-size:24px}.meta{display:grid;grid-template-columns:1fr 1fr}.leg{grid-template-columns:32px 1fr 20px 1fr}.seat{grid-column:2/5;padding:12px 0 0;border-top:1px solid #e2e6ef;border-left:0}.foot{align-items:flex-start;flex-direction:column}}
  </style>
</head>
<body>
  <main class="ticket">
    <div class="top"><div class="brand">RailSetu</div><div class="status">● Confirmed throughout</div></div>
    <section class="route"><div class="place"><span>${escapeHtml(fromName)}</span><strong>${escapeHtml(from)}</strong></div><div class="arrow">→</div><div class="place"><span>${escapeHtml(toName)}</span><strong>${escapeHtml(to)}</strong></div></section>
    <section class="meta"><div><small>TRAIN</small><strong>${escapeHtml(train)}</strong></div><div><small>DATE</small><strong>${escapeHtml(date)}</strong></div><div><small>CLASS</small><strong>${escapeHtml(travelClass)}</strong></div><div><small>FARE</small><strong>₹${fareLabel}</strong></div></section>
    <section class="legs">${legMarkup}</section>
    <footer class="foot"><div><small>TICKET ID</small><strong>${escapeHtml(ticketId)}</strong></div><div><small>COMFORT SCORE</small><strong>${escapeHtml(comfort)} / 100</strong></div><div><small>MOCK PAYMENT</small><strong>${escapeHtml(mode)}</strong></div></footer>
    <p class="disclaimer">RailSetu prototype ticket · Not valid for travel · No payment was collected</p>
  </main>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="RailSetu-${from}-${to}-mock-ticket.html"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
