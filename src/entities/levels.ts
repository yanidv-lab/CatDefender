import { BallMaterial, LevelData, PlankInventory, WoodType } from './types';
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
  inventory: Partial<Record<WoodType, number>>;
  hint: string;
}

/**
 * How much force the cat survives, derived from the level's own impact energy
 * rather than hand-tuned per level.
 *
 * Measured on level 1: an unsheltered cat takes ~67 N, while a correct A-frame
 * cuts that to ~17 N. A base of 32 N therefore sits clearly between "a real
 * shelter held" and "the boulder got through". Later levels scale that budget
 * with their own energy so the same standard applies, using an exponent just
 * under 1 so difficulty still creeps up as boulders get heavier and faster.
 */
const BASE_TOLERANCE = 32;
const TOLERANCE_EXPONENT = 0.92;

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
    inventory: { PINE: 2, OAK: 2 },
    hint: 'Angle your planks. A sloped roof deflects force sideways instead of absorbing it head-on.',
  },
  {
    title: 'Higher Ground',
    description: 'Same boulder, 18 metres up. It arrives noticeably faster.',
    dropHeightMeters: 18,
    reward: 180,
    boulders: [{ material: 'stone', radius: 30, density: 0.005, offsetX: 0 }],
    inventory: { PINE: 2, OAK: 2 },
    hint: 'Every extra metre adds speed on impact. Brace the roof with a support underneath.',
  },
  {
    title: 'Long Drop',
    description: 'A 26 metre fall. Flat planks will snap under this much energy.',
    dropHeightMeters: 26,
    reward: 250,
    boulders: [{ material: 'stone', radius: 32, density: 0.006, offsetX: 0 }],
    inventory: { PINE: 2, OAK: 2, IRONWOOD: 1 },
    hint: 'Triangles are the strongest shape. Lean two planks together into an A-frame.',
  },
  {
    title: 'Iron Sphere',
    description: 'The boulder is now solid iron — far heavier at the same height.',
    dropHeightMeters: 26,
    reward: 320,
    boulders: [{ material: 'iron', radius: 34, density: 0.012, offsetX: 0 }],
    inventory: { PINE: 2, OAK: 2, IRONWOOD: 1 },
    hint: 'Iron needs ironwood. Put your strongest plank where the impact lands.',
  },
  {
    title: 'Iron From Above',
    description: 'Iron, from 34 metres. The hardest single impact yet.',
    dropHeightMeters: 34,
    reward: 420,
    boulders: [{ material: 'iron', radius: 34, density: 0.012, offsetX: 0 }],
    inventory: { PINE: 2, OAK: 2, IRONWOOD: 2 },
    hint: 'Stack two layers. The top layer can break as long as the second one holds.',
  },
  {
    title: 'Twin Drop',
    description: 'Two stone boulders, seconds apart. The shelter has to survive both.',
    dropHeightMeters: 30,
    reward: 520,
    boulders: [
      { material: 'stone', radius: 30, density: 0.006, offsetX: -55 },
      { material: 'stone', radius: 32, density: 0.007, offsetX: 55, extraMeters: 3, dropDelayMs: 700 },
    ],
    inventory: { PINE: 3, OAK: 2, IRONWOOD: 2 },
    hint: 'A shelter that collapses on the first hit leaves the cat wide open for the second.',
  },
  {
    title: 'Avalanche',
    description: 'Three boulders across a wide spread, one of them iron.',
    dropHeightMeters: 34,
    reward: 650,
    boulders: [
      { material: 'stone', radius: 30, density: 0.006, offsetX: -80 },
      { material: 'iron', radius: 34, density: 0.011, offsetX: 0, extraMeters: 2, dropDelayMs: 500 },
      { material: 'stone', radius: 32, density: 0.007, offsetX: 80, extraMeters: 4, dropDelayMs: 1000 },
    ],
    inventory: { PINE: 3, OAK: 3, IRONWOOD: 2 },
    hint: 'Go wide. A narrow roof leaves the flanks exposed to the outer boulders.',
  },
  {
    title: 'Terminal Velocity',
    description: 'Iron from 45 metres. Everything you have learned, at full speed.',
    dropHeightMeters: 45,
    reward: 900,
    boulders: [
      { material: 'iron', radius: 36, density: 0.013, offsetX: -40 },
      { material: 'iron', radius: 36, density: 0.013, offsetX: 40, extraMeters: 5, dropDelayMs: 900 },
    ],
    inventory: { PINE: 3, OAK: 3, IRONWOOD: 3 },
    hint: 'Spend points on ironwood here. Anything lighter will not survive the first hit.',
  },
];

function buildInventory(partial: Partial<Record<WoodType, number>>): PlankInventory {
  return {
    PINE: partial.PINE ?? 0,
    OAK: partial.OAK ?? 0,
    IRONWOOD: partial.IRONWOOD ?? 0,
  };
}

export const GAME_LEVELS: LevelData[] = LEVEL_SPECS.map((spec, index) => {
  const dropPixels = metersToPixels(spec.dropHeightMeters);
  // Headroom above the highest boulder so nothing spawns flush against the ceiling.
  const maxExtra = Math.max(0, ...spec.boulders.map((b) => metersToPixels(b.extraMeters ?? 0)));
  const groundY = dropPixels + maxExtra + 90;
  // Constant across levels so the camera scale never changes between them.
  const worldWidth = spec.boulders.length > 2 ? WORLD_WIDTH_WIDE : WORLD_WIDTH_NARROW;
  const catX = worldWidth / 2;
  const catSize = 60;

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
      y: groundY - catSize / 2,
      width: catSize,
      height: catSize,
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
    startingInventory: buildInventory(spec.inventory),
    defaultPlankWidth: 145,
    defaultPlankHeight: 18,
    hints: [spec.hint],
  };
});
