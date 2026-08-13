import { LevelData } from './types';

export const GAME_LEVELS: LevelData[] = [
  {
    id: 1,
    title: "Level 1: The First Fall",
    description: "A heavy boulder drops straight down. Place wooden planks to build a simple roof over the cat!",
    worldWidth: 800,
    worldHeight: 600,
    groundY: 530,
    cat: {
      id: 'cat_1',
      x: 400,
      y: 500, // Sitting on ground
      width: 48,
      height: 48,
      maxDamageForce: 8.5,
    },
    balls: [
      {
        id: 'ball_1',
        x: 400,
        y: 80,
        radius: 30,
        density: 0.005, // Heavy
        restitution: 0.2,
        friction: 0.3,
        color: '#78716C', // Stone gray
      },
    ],
    availablePlanksCount: 3,
    defaultPlankWidth: 140,
    defaultPlankHeight: 18,
    hints: [
      "Tip: Drag planks onto the field and rotate them into a sloped roof or a strong A-frame!",
      "An angled roof deflects the ball's force sideways instead of absorbing direct downward impact."
    ]
  },
  {
    id: 2,
    title: "Level 2: Heavy Iron Sphere",
    description: "An extra heavy iron sphere will fall! Single flat planks will crack and snap under this weight. Build triangular bracing!",
    worldWidth: 800,
    worldHeight: 600,
    groundY: 530,
    cat: {
      id: 'cat_1',
      x: 400,
      y: 500,
      width: 48,
      height: 48,
      maxDamageForce: 8.0,
    },
    balls: [
      {
        id: 'ball_heavy',
        x: 400,
        y: 70,
        radius: 38,
        density: 0.012, // Very heavy iron ball
        restitution: 0.15,
        friction: 0.4,
        color: '#475569', // Dark iron
      },
    ],
    availablePlanksCount: 4,
    defaultPlankWidth: 150,
    defaultPlankHeight: 20,
    hints: [
      "Tip: Triangles are the strongest physical structures. Lean two planks together and support them with vertical columns!"
    ]
  },
  {
    id: 3,
    title: "Level 3: Twin Drop",
    description: "Two heavy stone boulders fall in quick succession from different positions! Protect the cat from both impacts.",
    worldWidth: 800,
    worldHeight: 600,
    groundY: 530,
    cat: {
      id: 'cat_1',
      x: 400,
      y: 500,
      width: 48,
      height: 48,
      maxDamageForce: 7.5,
    },
    balls: [
      {
        id: 'ball_left',
        x: 350,
        y: 70,
        radius: 32,
        density: 0.007,
        restitution: 0.25,
        friction: 0.3,
        color: '#78716C',
        dropDelayMs: 0,
      },
      {
        id: 'ball_right',
        x: 450,
        y: 60,
        radius: 34,
        density: 0.008,
        restitution: 0.2,
        friction: 0.3,
        color: '#57534E',
        dropDelayMs: 600,
      },
    ],
    availablePlanksCount: 5,
    defaultPlankWidth: 140,
    defaultPlankHeight: 18,
    hints: [
      "Tip: Make sure the shelter doesn't collapse under the first impact, leaving the cat exposed to the second drop!"
    ]
  },
  {
    id: 4,
    title: "Level 4: The Avalanche",
    description: "Three boulders fall in a chaotic spread. You have 6 planks to construct a wide fortress!",
    worldWidth: 900,
    worldHeight: 650,
    groundY: 570,
    cat: {
      id: 'cat_1',
      x: 450,
      y: 540,
      width: 52,
      height: 52,
      maxDamageForce: 7.0,
    },
    balls: [
      {
        id: 'ball_1',
        x: 380,
        y: 60,
        radius: 30,
        density: 0.006,
        restitution: 0.3,
        friction: 0.3,
        color: '#78716C',
        dropDelayMs: 0,
      },
      {
        id: 'ball_2',
        x: 450,
        y: 50,
        radius: 36,
        density: 0.009,
        restitution: 0.2,
        friction: 0.3,
        color: '#475569',
        dropDelayMs: 400,
      },
      {
        id: 'ball_3',
        x: 520,
        y: 70,
        radius: 32,
        density: 0.007,
        restitution: 0.25,
        friction: 0.3,
        color: '#78716C',
        dropDelayMs: 900,
      },
    ],
    availablePlanksCount: 6,
    defaultPlankWidth: 150,
    defaultPlankHeight: 20,
    hints: [
      "Tip: Wide double-walled shelters with overlapping planks absorb multi-directional kinetic energy."
    ]
  }
];
