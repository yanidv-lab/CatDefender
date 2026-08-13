// Entity definitions and Level Types for Cat Defender Physics

export type WoodType = 'PINE' | 'OAK' | 'IRONWOOD';

export interface WoodMaterialConfig {
  type: WoodType;
  name: string;
  description: string;
  density: number;
  maxHealth: number;
  /** Point cost to buy one plank of this material. Scales with strength. */
  price: number;
  color: string;
  borderColor: string;
  grainColor: string;
  badgeBg: string;
  badgeText: string;
}

export const WOOD_MATERIALS: Record<WoodType, WoodMaterialConfig> = {
  PINE: {
    type: 'PINE',
    name: 'Pine',
    description: 'Lightweight and brittle',
    density: 0.0015,
    maxHealth: 65,
    price: 60,
    color: '#D7CCC8',
    borderColor: '#8D6E63',
    grainColor: 'rgba(93, 64, 55, 0.25)',
    badgeBg: '#F5EBE6',
    badgeText: '#5D4037',
  },
  OAK: {
    type: 'OAK',
    name: 'Oak',
    description: 'Balanced and sturdy',
    density: 0.0035,
    maxHealth: 110,
    price: 100,
    color: '#795548',
    borderColor: '#3E2723',
    grainColor: 'rgba(255, 255, 255, 0.18)',
    badgeBg: '#EFEBE9',
    badgeText: '#3E2723',
  },
  IRONWOOD: {
    type: 'IRONWOOD',
    name: 'Ironwood',
    description: 'Heavy and ultra-tough',
    density: 0.008,
    maxHealth: 200,
    price: 250,
    color: '#3E2723',
    borderColor: '#1B1B1F',
    grainColor: 'rgba(255, 215, 0, 0.3)',
    badgeBg: '#21130D',
    badgeText: '#FFB300',
  },
};

export interface Vector2D {
  x: number;
  y: number;
}

export type BallMaterial = 'stone' | 'iron';

export interface BallConfig {
  id: string;
  x: number;
  y: number;
  radius: number;
  density: number;      // Determines mass
  restitution: number;  // Bounciness (0.1 - 0.9)
  friction: number;     // Surface friction (0.05 - 0.5)
  color?: string;
  material?: BallMaterial; // Which rendered sprite to use; defaults to 'stone'
  dropDelayMs?: number; // Delay before dropping if multi-ball
}

export interface PlankConfig {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;        // Radians
  maxHealth: number;    // e.g. 100 HP
  crackThreshold: number; // e.g. 30 (30% damage)
  breakThreshold: number; // e.g. 100 (100% damage)
  density: number;
  friction: number;
  restitution: number;
  color?: string;
}

export interface CatConfig {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  maxDamageForce: number; // Force threshold above which cat is hurt
  color?: string;
}

export interface LevelData {
  id: number;
  title: string;
  description: string;
  cat: CatConfig;
  balls: BallConfig[];
  /** Drop height of the boulder above the ground, in metres. Drives world size. */
  dropHeightMeters: number;
  /** Points awarded for clearing this level. */
  reward: number;
  defaultPlankWidth: number;
  defaultPlankHeight: number;
  groundY: number;
  worldWidth: number;
  worldHeight: number;
  hints?: string[];
}

export interface PlankDamageState {
  id: string;
  health: number;
  maxHealth: number;
  isCracked: boolean;
  isBroken: boolean;
  crackOffsetRatio?: number; // 0 to 1 where the split happened
}

export interface SimulationStats {
  /** Strongest collision anywhere in the scene — used for scoring/telemetry. */
  maxImpactForce: number;
  /** Strongest force that actually reached the cat. This is what decides a loss. */
  catImpactForce: number;
  planksCrackedCount: number;
  planksBrokenCount: number;
  timeElapsedSeconds: number;
  /** Altitude of the lowest still-falling boulder, in metres above the ground. */
  ballAltitudeMeters: number;
}
