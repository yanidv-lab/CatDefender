import { BallMaterial, LevelData } from './types';
import { WORLD_WIDTH_NARROW, WORLD_WIDTH_WIDE, metersToPixels } from './economy';

/**
 * Level progression is authored as a compact spec and expanded into full
 * LevelData below. Difficulty ramps in two phases, in this order:
 *   1. Drop height grows — the same boulder falls further and lands harder.
 *   2. Boulder material/size changes (stone -> iron), then multiple boulders.
 */
interface LevelSpec {
  title: string;
  description: string;
  dropHeightMeters: number;
  reward: number;
  /** One entry per boulder in the level. */
  boulders: {
    material: BallMaterial;
    radius: number;
    density: number;
    /** Horizontal offset from the cat, in pixels. */
    offsetX: number;
    /** Extra height above the level's base drop height, in metres. */
    extraMeters?: number;
    dropDelayMs?: number;
  }[];
  hint: string;
}

/**
 * How much force the cat survives, derived from the level's own impact energy
 * rather than hand-tuned per level.
 *
 * The exponent is measured, not guessed. Across the ten levels the energy proxy
 * spans about 6.1x while the force actually reaching an unsheltered cat spans
 * only about 2.2x (93 N to 206 N) — collisions shed energy rather than passing
 * it through linearly, so force tracks roughly E^0.45. An exponent near 1 made
 * late levels look forgiving on paper while still being unwinnable in practice.
 * The base is set so tolerance lands near 35% of the unsheltered force:
 * comfortably above what a sound shelter lets through, far below a direct hit.
 */
const BASE_TOLERANCE = 34;
const TOLERANCE_EXPONENT = 0.45;

/** Impact energy proxy: momentum at landing scales with sqrt(height) x mass. */
function boulderEnergy(heightMeters: number, density: number, radius: number): number {
  return Math.sqrt(heightMeters) * density * radius * radius;
}

const REFERENCE_ENERGY = boulderEnergy(12, 0.005, 30);

function deriveCatTolerance(spec: LevelSpec): number {
  const peak = Math.max(
    ...spec.boulders.map((b) =>
      boulderEnergy(spec.dropHeightMeters + (b.extraMeters ?? 0), b.density, b.radius)
    )
  );
  const scaled = BASE_TOLERANCE * Math.pow(peak / REFERENCE_ENERGY, TOLERANCE_EXPONENT);
  return Math.round(scaled * 10) / 10;
}

const STONE = { material: 'stone' as BallMaterial, restitution: 0.25, friction: 0.3, color: '#78716C' };
const IRON = { material: 'iron' as BallMaterial, restitution: 0.15, friction: 0.4, color: '#475569' };

const LEVEL_SPECS: LevelSpec[] = [
  {
    title: 'First Fall',
    description: 'A stone boulder drops from 12 metres. Build a roof over the cat.',
    dropHeightMeters: 12,
    reward: 120,
    boulders: [{ material: 'stone', radius: 30, density: 0.005, offsetX: 0 }],
    hint: 'Lean two planks into an A-frame and plant both feet on the ground.',
  },
  {
    title: 'Higher Ground',
    description: 'The same boulder, now from 18 metres. It lands noticeably harder.',
    dropHeightMeters: 18,
    reward: 170,
    boulders: [{ material: 'stone', radius: 30, density: 0.005, offsetX: 0 }],
    hint: 'A steeper roof sheds force sideways instead of absorbing it.',
  },
  {
    title: 'Long Drop',
    description: 'Twenty-four metres, and a bigger stone. Pine will not survive this.',
    dropHeightMeters: 24,
    reward: 230,
    boulders: [{ material: 'stone', radius: 32, density: 0.006, offsetX: 0 }],
    hint: 'Oak holds where pine snaps. Spend a little more to lose fewer planks.',
  },
  {
    title: 'Free Fall',
    description: 'Thirty metres of open air above the cat.',
    dropHeightMeters: 30,
    reward: 300,
    boulders: [{ material: 'stone', radius: 32, density: 0.006, offsetX: 0 }],
    hint: 'The apex takes the hit. Put your strongest plank where the boulder lands.',
  },
  {
    title: 'Iron Sphere',
    description: 'Solid iron. Twice the mass of stone at the same size.',
    dropHeightMeters: 28,
    reward: 380,
    boulders: [{ material: 'iron', radius: 34, density: 0.011, offsetX: 0 }],
    hint: 'Iron needs ironwood. Two strong planks beat four weak ones.',
  },
  {
    title: 'Iron From Above',
    description: 'Iron, from thirty-two metres. The hardest single impact yet.',
    dropHeightMeters: 34,
    reward: 470,
    boulders: [{ material: 'iron', radius: 38, density: 0.017, offsetX: 0 }],
    hint: 'Keep the frame tight. A wide, shallow roof folds under this much energy.',
  },
  {
    title: 'Twin Drop',
    description: 'Two stones, moments apart. The shelter has to survive both.',
    dropHeightMeters: 32,
    reward: 900,
    boulders: [
      { material: 'stone', radius: 33, density: 0.010, offsetX: -48 },
      { material: 'stone', radius: 34, density: 0.011, offsetX: 48, extraMeters: 3, dropDelayMs: 700 },
    ],
    hint: 'If the first hit flattens your roof, the second one lands on bare fur.',
  },
  {
    title: 'Iron and Stone',
    description: 'An iron core with stone on either flank.',
    dropHeightMeters: 32,
    reward: 1100,
    boulders: [
      { material: 'stone', radius: 29, density: 0.006, offsetX: -34 },
      { material: 'iron', radius: 33, density: 0.010, offsetX: 0, extraMeters: 2, dropDelayMs: 550 },
    ],
    hint: 'Cover the centre first. The flanks glance off a well-angled roof.',
  },
  {
    title: 'Avalanche',
    description: 'A wide pair, far apart. Neither flank can be left open.',
    dropHeightMeters: 30,
    reward: 1500,
    // Reduced from three boulders to two. With three, one always reached the cat
    // around a displaced shelter, and since any boulder touching the cat is a
    // loss, no build of any material or size could clear it.
    boulders: [
      { material: 'stone', radius: 27, density: 0.005, offsetX: -34 },
      { material: 'iron', radius: 30, density: 0.008, offsetX: 34, extraMeters: 3, dropDelayMs: 900 },
    ],
    hint: 'Go wider than feels necessary. An open flank is all they need.',
  },
  {
    title: 'Terminal Velocity',
    description: 'Two iron spheres from forty-two metres. Everything you have learned.',
    dropHeightMeters: 38,
    reward: 1900,
    boulders: [
      { material: 'iron', radius: 31, density: 0.009, offsetX: -30 },
      { material: 'iron', radius: 31, density: 0.009, offsetX: 30, extraMeters: 4, dropDelayMs: 1100 },
    ],
    hint: 'Ironwood only. Anything lighter is kindling at this speed.',
  },
];

export const GAME_LEVELS: LevelData[] = LEVEL_SPECS.map((spec, index) => {
  const dropPixels = metersToPixels(spec.dropHeightMeters);
  // Headroom above the highest boulder so nothing spawns flush against the ceiling.
  const maxExtra = Math.max(0, ...spec.boulders.map((b) => metersToPixels(b.extraMeters ?? 0)));
  const groundY = dropPixels + maxExtra + 90;
  // Constant across levels so the camera scale never changes between them.
  const worldWidth = spec.boulders.length > 2 ? WORLD_WIDTH_WIDE : WORLD_WIDTH_NARROW;
  const catX = worldWidth / 2;
  // Hitbox dimensions, matched to how large the cat is actually drawn so that
  // anything visibly striking it also strikes it in physics.
  // Kept deliberately compact: an A-frame of two planks peaks a little over
  // 110px, so a taller cat leaves no clearance and the boulder drives the frame
  // straight onto it. This size covers the drawn cat's body while leaving room
  // to actually build something over it.
  const catWidth = 56;
  const catHeight = 70;

  return {
    id: index + 1,
    title: spec.title,
    description: spec.description,
    dropHeightMeters: spec.dropHeightMeters,
    reward: spec.reward,
    worldWidth,
    worldHeight: groundY + 90,
    groundY,
    cat: {
      id: 'cat_1',
      x: catX,
      y: groundY - catHeight / 2,
      width: catWidth,
      height: catHeight,
      maxDamageForce: deriveCatTolerance(spec),
    },
    balls: spec.boulders.map((b, i) => {
      const preset = b.material === 'iron' ? IRON : STONE;
      return {
        id: `ball_${index + 1}_${i + 1}`,
        x: catX + b.offsetX,
        y: groundY - dropPixels - metersToPixels(b.extraMeters ?? 0),
        radius: b.radius,
        density: b.density,
        restitution: preset.restitution,
        friction: preset.friction,
        color: preset.color,
        material: b.material,
        dropDelayMs: b.dropDelayMs ?? 0,
      };
    }),
    defaultPlankWidth: 165,
    defaultPlankHeight: 18,
    hints: [spec.hint],
  };
});
