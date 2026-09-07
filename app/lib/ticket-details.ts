type TimedLeg = { departure: string; arrival: string };

function minutes(time: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return 0;
  return Math.min(23, Number(match[1])) * 60 + Math.min(59, Number(match[2]));
}

function datedLabel(date: string, time: string, dayOffset: number) {
  const [year, month, day] = date.split('-').map(Number);
  const instant = new Date(Date.UTC(year || 2026, Math.max(0, (month || 1) - 1), day || 1));
  instant.setUTCDate(instant.getUTCDate() + dayOffset);
  const dayLabel = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(instant);
  return `${dayLabel} · ${time || '—'}`;
}

export function ticketSchedule(date: string, legs: TimedLeg[]) {
  const first = legs[0] ?? { departure: '20:10', arrival: '01:05' };
  let dayOffset = 0;
  let previous = minutes(first.departure);
  let finalArrival = first.arrival;
  for (const leg of legs) {
    for (const time of [leg.departure, leg.arrival]) {
      const current = minutes(time);
      if (current < previous) dayOffset += 1;
      previous = current;
      finalArrival = time;
    }
  }
  return { departure: datedLabel(date, first.departure, 0), arrival: datedLabel(date, finalArrival, dayOffset) };
}

export function ticketPnr(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  return String((hash >>> 0) * 2 + 1_000_000_000).slice(0, 10).padStart(10, '0');
}
