export type ComfortFactor = {
  id: string;
  label: string;
  impact: number;
  explanation: string;
};

export type ComfortScoreDetails = {
  score: number;
  label: 'Effortless' | 'Very comfortable' | 'Manageable' | 'High effort' | 'Not recommended';
  summary: string;
  factors: ComfortFactor[];
};

type ScoringLeg = {
  from: { time: string };
  to: { time: string };
  coach: string;
  berth: 'LB' | 'MB' | 'UB' | 'SL';
};

type ScoringQuery = {
  profile: 'standard' | 'elderly' | 'family';
  luggage: 'light' | 'heavy';
  lowerBerth: boolean;
};

const profileMultipliers = {
  standard: 1,
  elderly: 1.5,
  family: 1.25,
} as const;

function isNightTransition(time: string) {
  const hour = Number(time.split(':')[0]);
  return Number.isFinite(hour) && (hour >= 22 || hour < 6);
}

function scoreLabel(score: number): ComfortScoreDetails['label'] {
  if (score >= 90) return 'Effortless';
  if (score >= 80) return 'Very comfortable';
  if (score >= 65) return 'Manageable';
  if (score >= 50) return 'High effort';
  return 'Not recommended';
}

export function calculateComfortScore(legs: ScoringLeg[], coachDistances: number[], query: ScoringQuery): ComfortScoreDetails {
  const factors: ComfortFactor[] = [];
  const changes = Math.max(0, legs.length - 1);
  const profileMultiplier = profileMultipliers[query.profile];
  const luggageMultiplier = query.luggage === 'heavy' ? 1.25 : 1;
  const transitionMultiplier = profileMultiplier * luggageMultiplier;

  if (changes > 0) {
    const impact = -Math.round(changes * 4 * transitionMultiplier);
    factors.push({
      id: 'seat-transitions',
      label: changes + ' seat change' + (changes === 1 ? '' : 's'),
      impact,
      explanation: 'Each seat transition starts at −4 and is adjusted for the traveller profile' + (query.luggage === 'heavy' ? ' and heavy luggage' : '') + '.',
    });

    factors.push({
      id: 'ticket-complexity',
      label: legs.length + ' confirmed tickets',
      impact: -(changes * 2),
      explanation: 'Every additional ticket adds a small coordination burden.',
    });
  }

  const coachMoves = coachDistances.filter((distance) => distance > 0);
  if (coachMoves.length) {
    const rawCoachBurden = coachMoves.reduce((total, distance) => total + 10 + distance * 1.5, 0);
    const impact = -Math.round(rawCoachBurden * transitionMultiplier);
    factors.push({
      id: 'coach-movement',
      label: coachMoves.length + ' coach change' + (coachMoves.length === 1 ? '' : 's'),
      impact,
      explanation: 'Coach changes carry a −10 base penalty, plus distance and traveller-aware mobility adjustments.',
    });
  } else if (changes > 0) {
    factors.push({
      id: 'same-coach',
      label: 'Same coach throughout',
      impact: 2,
      explanation: 'Keeping every confirmed segment in one coach earns a continuity bonus.',
    });
  }

  const nightChanges = legs.slice(0, -1).filter((leg) => isNightTransition(leg.to.time)).length;
  if (nightChanges) {
    factors.push({
      id: 'night-transitions',
      label: nightChanges + ' overnight change' + (nightChanges === 1 ? '' : 's'),
      impact: -(nightChanges * 5),
      explanation: 'Seat or coach changes between 10 PM and 6 AM are more disruptive.',
    });
  }

  if (query.lowerBerth) {
    const middleBerths = legs.filter((leg) => leg.berth === 'MB').length;
    const upperBerths = legs.filter((leg) => leg.berth === 'UB').length;
    const berthImpact = -(middleBerths * 9 + upperBerths * 15);
    if (berthImpact) {
      factors.push({
        id: 'berth-fit',
        label: 'Lower-berth preference mismatch',
        impact: berthImpact,
        explanation: 'Middle berths cost 9 points and upper berths cost 15 when a lower berth is preferred. Side-lower remains an acceptable match.',
      });
    } else if (legs.length > 0 && legs.every((leg) => leg.berth === 'LB')) {
      factors.push({
        id: 'lower-berth',
        label: 'Lower berth throughout',
        impact: 3,
        explanation: 'Every segment matches the requested lower berth.',
      });
    }
  }

  const score = Math.max(0, Math.min(100, Math.round(100 + factors.reduce((total, factor) => total + factor.impact, 0))));
  const strongestPenalty = [...factors].filter((factor) => factor.impact < 0).sort((first, second) => first.impact - second.impact)[0];
  const strongestBonus = [...factors].filter((factor) => factor.impact > 0).sort((first, second) => second.impact - first.impact)[0];
  const summary = [strongestBonus?.label, strongestPenalty?.label].filter(Boolean).join(' · ') || 'No material comfort penalties';

  return { score, label: scoreLabel(score), summary, factors };
}
