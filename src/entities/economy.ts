import { WOOD_MATERIALS, WoodType } from './types';

/**
 * World scale. Every level's drop height is authored in metres and converted to
 * pixels through this constant, so a taller level is genuinely a taller physics
 * world — the boulder really does fall further and arrive faster. The camera
 * auto-fits the world, so tall levels naturally render the cat and boulder
 * smaller while the barometer keeps reporting the real height.
 */
export const PIXELS_PER_METER = 55;

/**
 * Every level is authored to the same world width so the camera scale is
 * constant from level to level: the cat, planks and boulders stay the same
 * on-screen size throughout. Taller levels simply extend upward out of view,
 * and the boulder falls into frame — the barometer reports how far up it is.
 */
// Narrow on purpose. A two-plank A-frame splays its feet under load in this
// engine; a snug world lets the frame brace against the side walls, which is
// what makes a free-standing shelter hold at all — and it keeps the cat large
// on screen.
export const WORLD_WIDTH_NARROW = 420;
export const WORLD_WIDTH_WIDE = 520;

export function metersToPixels(meters: number): number {
  return meters * PIXELS_PER_METER;
}

export function pixelsToMeters(pixels: number): number {
  return pixels / PIXELS_PER_METER;
}

/** Points the player starts with on a fresh save — enough for a few planks. */
export const STARTING_POINTS = 300;

/**
 * Clearing a level with a lean shelter pays better. The bonus starts at this
 * value and falls away with each plank used, so an economical build is worth
 * more than a brute-forced wall of wood.
 */
export const EFFICIENCY_BONUS = 240;
export const EFFICIENCY_FALLOFF = 40;

export function plankPrice(woodType: WoodType): number {
  return WOOD_MATERIALS[woodType].price;
}

/**
 * Score for clearing a level: the level's own reward plus an efficiency bonus
 * that shrinks with each plank used, so the cheapest shelter that survives
 * scores highest.
 */
export function calculateLevelScore(levelReward: number, planksUsed: number): number {
  const bonus = Math.max(0, EFFICIENCY_BONUS - planksUsed * EFFICIENCY_FALLOFF);
  return levelReward + bonus;
}
