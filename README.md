# Cat Defender Physics — 2D Physics Puzzle Game Prototype

A browser-based and native-ready 2D physics puzzle game prototype built with **React**, **TypeScript**, **Vite**, and **Matter.js**. 

The player's mission is to protect a cat sitting on the ground from heavy falling boulders by strategically constructing a wooden shelter out of a limited supply of planks before dropping the boulder.

---

## 🏗 Architecture & Layer Separation

This codebase follows a strict 3-tier architectural separation of concerns to ensure modularity, maintainability, and effortless future expansion:

```
src/
├── entities/     # Layer 2: Configuration & Data Schemas (Plain TS)
│   ├── types.ts  # Types for Cat, Plank, Ball, Level, and Stats
│   └── levels.ts # Level definitions (JSON/TS objects)
│
├── engine/       # Layer 1: Physics Simulation & Logic (Matter.js - Pure Logic)
│   ├── physicsEngine.ts # Physics world, breakable rigid bodies, collision listeners
│   └── soundEffects.ts  # Offline Web Audio API sound synthesizer
│
└── render/       # Layer 3: Visual Presentation & React UI (No Physics Logic)
    ├── GameCanvas.tsx   # Canvas drawing loop (reads positions/angles/damage from engine)
    └── GameHUD.tsx      # Responsive touch-first overlay controls & level modals
```

### Layer Responsibilities
1. **`/engine` (`PhysicsEngine`)**: Handles Matter.js world creation, rigid body definitions, gravity, collision detection, breakable body tracking, and win/fail condition evaluations. It contains **zero rendering code** and exposes getter methods for the render layer to read state safely.
2. **`/entities` (`types.ts`, `levels.ts`)**: Plain data types and level definitions specifying ball mass/radius, cat placement, available plank counts, and hint descriptions. No hardcoded magic numbers inline.
3. **`/render` (`GameCanvas`, `GameHUD`)**: Reads positions, angles, damage flags, and game states from the engine to draw the canvas frames and render touch-friendly UI controls. **Never mutates physics bodies directly.**

---

## 🪵 How the Breakable-Plank System Works

Unlike traditional rigid bodies that are indestructible, planks in Cat Defender feature dynamic physical fracturing:

1. **Health Tracking**: Each plank tracks `health` (100 HP), `isCracked`, and `isBroken` flags.
2. **Impact Calculation**: On Matter.js `collisionStart` events, the relative velocity and mass ratio between colliding bodies derive the kinetic impact energy:
   $$\text{Impact Energy} = \Delta v \times \frac{m_A \cdot m_B}{m_A + m_B}$$
3. **Cracking Threshold**: When health drops below 65% HP, the plank is flagged as `isCracked`. The render layer displays a crack overlay.
4. **Physical Snapping (Full Break)**:
   - When health reaches 0 HP, the original plank rigid body is removed from the physics world.
   - Two smaller separate rigid bodies (each half length) are spawned at the exact fracture location with appropriate angular offset and position.
   - Both pieces inherit the parent plank's linear velocity $\mathbf{v}$ and angular velocity $\omega$, plus a slight outward scatter impulse.
   - The break continues to be simulated physically by Matter.js.

---

## 🎮 How to Add a New Level

To add a new level, open `src/entities/levels.ts` and append a new level object to `GAME_LEVELS`:

```typescript
{
  id: 5,
  title: "Level 5: Heavy Boulder Shower",
  description: "Multiple iron spheres fall simultaneously! Construct an arched shield.",
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
      id: 'boulder_1',
      x: 360,
      y: 70,
      radius: 35,
      density: 0.010, // Higher density = heavier mass
      restitution: 0.2,
      friction: 0.3,
      color: '#475569',
      dropDelayMs: 0,
    },
    {
      id: 'boulder_2',
      x: 440,
      y: 50,
      radius: 35,
      density: 0.010,
      restitution: 0.2,
      friction: 0.3,
      color: '#475569',
      dropDelayMs: 500, // Drops 500ms after first ball
    }
  ],
  availablePlanksCount: 5,
  defaultPlankWidth: 150,
  defaultPlankHeight: 20,
  hints: ["Tip: Support diagonal planks with vertical pillars for optimal load distribution."]
}
```

---

## 🎨 Where Art Assets Should Be Plugged In Later

To replace the placeholder canvas drawing shapes with custom sprites or PNG assets:

1. Place image files inside `public/assets/` (e.g. `public/assets/cat_idle.png`, `public/assets/cat_hurt.png`, `public/assets/plank_wood.png`, `public/assets/boulder.png`).
2. Open `src/render/GameCanvas.tsx`.
3. In `drawCat()`, replace `ctx.roundRect(...)` with `ctx.drawImage(catImage, -width/2, -height/2, width, height)`.
4. In `drawPhysicsPlank()`, replace `ctx.roundRect(...)` with `ctx.drawImage(plankImage, -w/2, -h/2, w, h)`.
5. No changes inside `/src/engine` are needed!

---

## 📱 Mobile & Android Readiness

This prototype is engineered for Android WebView / Capacitor embedding:
- Touch target sizes are $\ge 44 \times 44\text{px}$.
- Supports touch drag, rotation handles, and camera pan/zoom gestures.
- Clean off-screen fragment recycling limits dynamic rigid bodies well under 100 bodies for optimal 60fps performance on mobile WebViews.
- Fully offline Web Audio API sound generator with zero external URL network dependencies.

---

## 🛠 Local Development

```bash
# Install dependencies
npm install

# Start local Vite development server
npm run dev

# Build production bundle (outputs directly to app/src/main/assets for Android APK compilation)
npm run build
```
