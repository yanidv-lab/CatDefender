import { LevelData, SimulationStats } from '../entities/types';

// Star rating for a WON level, derived entirely from stats the physics engine
// already tracks: how much force got through relative to the cat's tolerance,
// and whether the shelter stayed fully intact.
export function calculateStars(stats: SimulationStats, level: LevelData): number {
  const forceRatio = stats.maxImpactForce / level.cat.maxDamageForce;
  const shelterIntact = stats.planksBrokenCount === 0;

  if (shelterIntact && forceRatio <= 0.5) return 3;
  if (shelterIntact && forceRatio <= 0.85) return 2;
  return 1;
}
