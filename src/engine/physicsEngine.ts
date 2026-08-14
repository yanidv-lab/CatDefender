import Matter from 'matter-js';
import { LevelData, PlankDamageState, SimulationStats, WoodType, WOOD_MATERIALS } from '../entities/types';
import { pixelsToMeters } from '../entities/economy';

export type GameState = 'EDITING' | 'SIMULATING' | 'WON' | 'FAILED';

export interface PlacedPlank {
  id: string;
  x: number;
  y: number;
  angle: number; // in radians
  width: number;
  height: number;
  woodType?: WoodType;
}

export interface PhysicsEngineCallbacks {
  onGameStateChange: (state: GameState) => void;
  onPlankDamageUpdate: (damageMap: Map<string, PlankDamageState>) => void;
  onCatImpact: (force: number) => void;
  onStatsUpdate: (stats: SimulationStats) => void;
  onSoundTrigger?: (type: 'wood_impact' | 'wood_snap' | 'cat_hurt' | 'cat_win' | 'ball_drop') => void;
  onPlankBreak?: (x: number, y: number, vx: number, vy: number, width: number, height: number) => void;
}

export class PhysicsEngine {
  private engine: Matter.Engine;
  private world: Matter.World;
  private runner: Matter.Runner | null = null;

  private currentLevel: LevelData | null = null;
  private gameState: GameState = 'EDITING';
  private callbacks: PhysicsEngineCallbacks;

  // Tracked bodies
  private groundBody: Matter.Body | null = null;
  private leftWallBody: Matter.Body | null = null;
  private rightWallBody: Matter.Body | null = null;
  private catBody: Matter.Body | null = null;
  private ballBodies: Map<string, Matter.Body> = new Map();
  private plankBodies: Map<string, Matter.Body> = new Map(); // plankId -> main Body
  private fragmentBodies: Matter.Body[] = [];

  // Data tracking
  private placedPlanks: PlacedPlank[] = [];
  private plankDamageStates: Map<string, PlankDamageState> = new Map();
  private maxImpactForce: number = 0;
  private maxCatImpactForce: number = 0;
  private catHurt: boolean = false;
  private simulationStartTime: number = 0;
  /**
   * Seed for the deterministic scatter applied to plank fragments. Fragments
   * used to take Math.random() velocities, and because they go on to collide
   * with the boulder and the rest of the shelter, an identical build could win
   * one run and lose the next. Re-seeding per simulation makes a given build
   * always play out the same way — fair for the player, and measurable.
   */
  private rngState: number = 1;
  private activeAnimationFrame: number | null = null;

  constructor(callbacks: PhysicsEngineCallbacks) {
    this.callbacks = callbacks;
    this.engine = Matter.Engine.create({
      gravity: { x: 0, y: 1.2, scale: 0.001 },
      enableSleeping: false,
    });
    this.world = this.engine.world;

    this.setupCollisionEvents();
  }

  public setOnPlankBreak(fn: (x: number, y: number, vx: number, vy: number, width: number, height: number) => void) {
    this.callbacks.onPlankBreak = fn;
  }

  public setOnCatImpact(fn: (force: number) => void) {
    this.callbacks.onCatImpact = fn;
  }

  public initLevel(level: LevelData, userPlanks: PlacedPlank[]) {
    this.stopSimulation();
    this.currentLevel = level;
    this.gameState = 'EDITING';
    this.catHurt = false;
    this.maxImpactForce = 0;
    this.maxCatImpactForce = 0;
    this.rngState = 0x9e3779b9 ^ level.id;
    this.placedPlanks = [...userPlanks];
    this.plankDamageStates.clear();
    this.fragmentBodies = [];

    // Clear world
    Matter.World.clear(this.world, false);

    // 1. Create Ground & Boundaries
    const groundHeight = 80;
    this.groundBody = Matter.Bodies.rectangle(
      level.worldWidth / 2,
      level.groundY + groundHeight / 2,
      level.worldWidth * 2,
      groundHeight,
      {
        isStatic: true,
        friction: 0.8,
        restitution: 0.2,
        label: 'ground',
      }
    );

    this.leftWallBody = Matter.Bodies.rectangle(
      -20,
      level.worldHeight / 2,
      40,
      level.worldHeight * 2,
      { isStatic: true, label: 'wall' }
    );

    this.rightWallBody = Matter.Bodies.rectangle(
      level.worldWidth + 20,
      level.worldHeight / 2,
      40,
      level.worldHeight * 2,
      { isStatic: true, label: 'wall' }
    );

    Matter.World.add(this.world, [this.groundBody, this.leftWallBody, this.rightWallBody]);

    // 2. Create Cat Hitbox, matching the drawn cat's footprint. It used to be
    // scaled to 55% to stop shelter legs grazing it, but the sprite is drawn far
    // larger than that, so boulders visibly crushed the cat while missing the
    // box entirely. Grazing is now handled by the force threshold instead.
    this.catBody = Matter.Bodies.rectangle(
      level.cat.x,
      level.cat.y,
      level.cat.width,
      level.cat.height,
      {
        isStatic: true, // Cat sits firmly on ground
        friction: 0.9,
        restitution: 0.1,
        label: 'cat',
        density: 0.01,
      }
    );
    (this.catBody as any).customData = { catId: level.cat.id };
    Matter.World.add(this.world, this.catBody);

    // 3. Create Balls (held static at top in EDITING mode)
    this.ballBodies.clear();
    level.balls.forEach((ballCfg) => {
      const ballBody = Matter.Bodies.circle(
        ballCfg.x,
        ballCfg.y,
        ballCfg.radius,
        {
          isStatic: true, // Static until Drop
          density: ballCfg.density,
          restitution: ballCfg.restitution,
          friction: ballCfg.friction,
          label: 'ball',
        }
      );
      (ballBody as any).customData = {
        ballId: ballCfg.id,
        dropDelayMs: ballCfg.dropDelayMs || 0,
        material: ballCfg.material || 'stone',
      };
      this.ballBodies.set(ballCfg.id, ballBody);
      Matter.World.add(this.world, ballBody);
    });

    // 4. Create Planks (Static in EDITING mode)
    this.plankBodies.clear();
    this.placedPlanks.forEach((p) => {
      const wType = p.woodType || 'OAK';
      const mat = WOOD_MATERIALS[wType] || WOOD_MATERIALS.OAK;

      const plankBody = Matter.Bodies.rectangle(
        p.x,
        p.y,
        p.width,
        p.height,
        {
          // Held in place for the whole build phase, mid-air included. Gravity
          // is only applied when the player starts the level.
          isStatic: true,
          angle: p.angle,
          density: mat.density,
          friction: 0.6,
          restitution: 0.15,
          label: 'plank',
        }
      );

      const maxHealth = mat.maxHealth;
      (plankBody as any).customData = {
        plankId: p.id,
        woodType: wType,
        maxHealth,
        health: maxHealth,
        isCracked: false,
        isBroken: false,
        width: p.width,
        height: p.height,
      };

      this.plankBodies.set(p.id, plankBody);
      this.plankDamageStates.set(p.id, {
        id: p.id,
        health: maxHealth,
        maxHealth,
        isCracked: false,
        isBroken: false,
      });

      Matter.World.add(this.world, plankBody);
    });

    this.callbacks.onGameStateChange('EDITING');
    this.callbacks.onPlankDamageUpdate(new Map(this.plankDamageStates));

    this.stopSimulation();
  }

  /**
   * Reconciles the world with the player's plank list without rebuilding it,
   * so repositioning one plank never disturbs the rest of the build.
   */
  public updatePlacedPlanks(userPlanks: PlacedPlank[]) {
    if (this.gameState !== 'EDITING' || !this.currentLevel) return;

    const incomingIds = new Set(userPlanks.map((p) => p.id));

    // Remove bodies whose planks are gone
    this.plankBodies.forEach((body, id) => {
      if (!incomingIds.has(id)) {
        Matter.World.remove(this.world, body);
        this.plankBodies.delete(id);
        this.plankDamageStates.delete(id);
      }
    });

    userPlanks.forEach((p) => {
      const existing = this.plankBodies.get(p.id);
      if (!existing) {
        this.addPlankBody(p);
        return;
      }
      // Nothing is simulated yet, so every plank just follows the position the
      // player put it in.
      Matter.Body.setPosition(existing, { x: p.x, y: p.y });
      Matter.Body.setAngle(existing, p.angle);
    });

    this.callbacks.onPlankDamageUpdate(new Map(this.plankDamageStates));
  }

  private addPlankBody(p: PlacedPlank) {
    const wType = p.woodType || 'OAK';
    const mat = WOOD_MATERIALS[wType] || WOOD_MATERIALS.OAK;

    const plankBody = Matter.Bodies.rectangle(p.x, p.y, p.width, p.height, {
      isStatic: true,
      angle: p.angle,
      density: mat.density,
      friction: 0.6,
      restitution: 0.15,
      label: 'plank',
    });

    (plankBody as any).customData = {
      plankId: p.id,
      woodType: wType,
      maxHealth: mat.maxHealth,
      health: mat.maxHealth,
      isCracked: false,
      isBroken: false,
      width: p.width,
      height: p.height,
    };

    this.plankBodies.set(p.id, plankBody);
    this.plankDamageStates.set(p.id, {
      id: p.id,
      health: mat.maxHealth,
      maxHealth: mat.maxHealth,
      isCracked: false,
      isBroken: false,
    });
    Matter.World.add(this.world, plankBody);
  }

  public startDropSimulation() {
    if (this.gameState !== 'EDITING' || !this.currentLevel) return;

    this.gameState = 'SIMULATING';
    this.callbacks.onGameStateChange('SIMULATING');
    this.callbacks.onSoundTrigger?.('ball_drop');
    this.simulationStartTime = Date.now();

    // 1. Gravity arrives now: the whole structure goes live at once, so an
    //    unsupported build collapses exactly as the player placed it.
    this.plankBodies.forEach((plankBody) => {
      Matter.Body.setStatic(plankBody, false);
      Matter.Body.setSpeed(plankBody, 0);
    });

    // 2. Schedule Ball release (accounting for optional dropDelayMs)
    this.ballBodies.forEach((ballBody) => {
      const dropDelay = (ballBody as any).customData?.dropDelayMs || 0;
      if (dropDelay <= 0) {
        Matter.Body.setStatic(ballBody, false);
      } else {
        setTimeout(() => {
          if (this.gameState === 'SIMULATING') {
            Matter.Body.setStatic(ballBody, false);
          }
        }, dropDelay);
      }
    });

    // 3. Start custom simulation loop
    this.activeAnimationFrame = requestAnimationFrame(this.runLoop);
  }

  private runLoop = () => {
    if (this.gameState !== 'SIMULATING') return;

    // Step physics engine at 60fps
    Matter.Engine.update(this.engine, 1000 / 60);

    // Cleanup offscreen fragments
    this.cleanupOffscreenBodies();

    // Check Win / Lose simulation end conditions
    this.checkSimulationEndCondition();

    // Broadcast updated stats
    const elapsedSeconds = (Date.now() - this.simulationStartTime) / 1000;
    let crackedCount = 0;
    let brokenCount = 0;
    this.plankDamageStates.forEach((state) => {
      if (state.isBroken) brokenCount++;
      else if (state.isCracked) crackedCount++;
    });

    this.callbacks.onStatsUpdate({
      maxImpactForce: this.maxImpactForce,
      catImpactForce: this.maxCatImpactForce,
      planksCrackedCount: crackedCount,
      planksBrokenCount: brokenCount,
      timeElapsedSeconds: Math.round(elapsedSeconds * 10) / 10,
      ballAltitudeMeters: this.getLeadingBallAltitudeMeters(),
    });

    this.activeAnimationFrame = requestAnimationFrame(this.runLoop);
  };

  /**
   * Altitude of the boulder closest to the ground — the one about to land, and
   * so the one the barometer should be tracking. Reported in metres so the UI
   * never has to know about pixel scale.
   */
  private getLeadingBallAltitudeMeters(): number {
    if (!this.currentLevel || this.ballBodies.size === 0) return 0;
    const groundY = this.currentLevel.groundY;
    let lowestAltitude = Infinity;
    this.ballBodies.forEach((ball) => {
      const altitudePx = groundY - ball.position.y - (ball as any).circleRadius;
      lowestAltitude = Math.min(lowestAltitude, altitudePx);
    });
    if (!isFinite(lowestAltitude)) return 0;
    return Math.max(0, pixelsToMeters(lowestAltitude));
  }

  /** Deterministic [0,1) PRNG (mulberry32), reseeded at each level start. */
  private nextRandom(): number {
    this.rngState = (this.rngState + 0x6d2b79f5) | 0;
    let t = this.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private setupCollisionEvents() {
    Matter.Events.on(this.engine, 'collisionStart', (event) => {
      if (this.gameState !== 'SIMULATING') return;

      event.pairs.forEach((pair) => {
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;

        // Calculate impact velocity/momentum
        const vA = bodyA.velocity;
        const vB = bodyB.velocity;
        const relVelX = vA.x - vB.x;
        const relVelY = vA.y - vB.y;
        const speedSq = relVelX * relVelX + relVelY * relVelY;
        const speed = Math.sqrt(speedSq);

        const massA = bodyA.isStatic ? 10 : bodyA.mass;
        const massB = bodyB.isStatic ? 10 : bodyB.mass;
        const reducedMass = (massA * massB) / (massA + massB);
        const impactForce = speed * reducedMass;

        if (impactForce > this.maxImpactForce) {
          this.maxImpactForce = Math.round(impactForce * 10) / 10;
        }

        // Trigger impact sound
        if (impactForce > 2.0 && (bodyA.label === 'plank' || bodyB.label === 'plank')) {
          this.callbacks.onSoundTrigger?.('wood_impact');
        }

        // --- CAT HITBOX COLLISION ---
        // Evaluated before the slow-contact filter below: a boulder settling
        // onto the cat arrives slowly but is still lethal, and skipping it was
        // why many visible hits never registered as a loss.
        if (bodyA.label === 'cat' || bodyB.label === 'cat') {
          const otherBody = bodyA.label === 'cat' ? bodyB : bodyA;
          if (otherBody.label !== 'ground' && otherBody.label !== 'wall') {
            if (impactForce > this.maxCatImpactForce) {
              this.maxCatImpactForce = Math.round(impactForce * 10) / 10;
            }
            if (impactForce > 0.8) {
              this.callbacks.onCatImpact(impactForce);
            }

            if (otherBody.label === 'ball') {
              // A boulder reaching the cat at all means the shelter failed —
              // that is the entire object of the game, so it is not a question
              // of how hard it landed.
              this.triggerCatHurt();
            } else {
              // Planks and debris only count above the level's force budget, so
              // a shelter leg coming to rest against the cat stays harmless.
              const catThreshold = this.currentLevel?.cat.maxDamageForce || 8.0;
              if (impactForce >= catThreshold) this.triggerCatHurt();
            }
          }
        }

        if (speed < 0.5) return; // Ignore minor sliding contacts for plank wear

        // --- PLANK BREAKABLE SYSTEM ---
        this.handlePlankImpact(bodyA, impactForce);
        this.handlePlankImpact(bodyB, impactForce);
      });
    });
  }

  private handlePlankImpact(body: Matter.Body, force: number) {
    if (body.label !== 'plank' || !body.customData) return;

    const data = body.customData;
    if (data.isBroken || !data.plankId) return;

    const forceThreshold = 1.5; // minimum force to cause damage
    if (force < forceThreshold) return;

    const currentHealth = data.health ?? 100;
    // Damage is scaled so plank health actually means something. Real impacts in
    // this game land between roughly 90 N and 200 N; at the old 7.5x multiplier
    // that dealt 600-1500 damage, which shattered pine and ironwood alike on
    // first contact and made material choice irrelevant. At 1.2x, oak (110 HP)
    // gives way around 90 N while ironwood (200 HP) holds until about 170 N.
    const damage = (force - forceThreshold) * 1.2;
    const newHealth = Math.max(0, currentHealth - damage);
    data.health = newHealth;

    const plankId = data.plankId;
    const currentState = this.plankDamageStates.get(plankId) || {
      id: plankId,
      health: 100,
      maxHealth: 100,
      isCracked: false,
      isBroken: false,
    };

    currentState.health = newHealth;

    // Check partial damage (cracked)
    if (newHealth <= 65 && !data.isCracked) {
      data.isCracked = true;
      currentState.isCracked = true;
    }

    // Check full break (snapped into 2 smaller rigid bodies)
    if (newHealth <= 0 && !data.isBroken) {
      data.isBroken = true;
      currentState.isBroken = true;
      this.snapPlankIntoFragments(body);
      this.callbacks.onSoundTrigger?.('wood_snap');
    }

    this.plankDamageStates.set(plankId, { ...currentState });
    this.callbacks.onPlankDamageUpdate(new Map(this.plankDamageStates));
  }

  private snapPlankIntoFragments(originalPlank: Matter.Body) {
    const data = originalPlank.customData;
    if (!data) return;

    const { x, y } = originalPlank.position;
    const angle = originalPlank.angle;
    const width = data.width || 140;
    const height = data.height || 18;

    // 2 half-size rigid bodies
    const halfW = width / 2;
    const offsetDist = halfW / 2;

    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Piece 1 position (left/top half)
    const p1X = x - offsetDist * cosA;
    const p1Y = y - offsetDist * sinA;

    // Piece 2 position (right/bottom half)
    const p2X = x + offsetDist * cosA;
    const p2Y = y + offsetDist * sinA;

    const vel = originalPlank.velocity;
    const angVel = originalPlank.angularVelocity;

    this.callbacks.onPlankBreak?.(x, y, vel.x, vel.y, width, height);

    const woodType: WoodType = ((originalPlank as any).customData?.woodType as WoodType) || 'OAK';
    const mat = WOOD_MATERIALS[woodType] || WOOD_MATERIALS.OAK;

    // Create fragment 1
    const frag1 = Matter.Bodies.rectangle(p1X, p1Y, halfW, height, {
      angle: angle,
      density: mat.density,
      friction: 0.5,
      restitution: 0.2,
      label: 'fragment',
    });

    // Create fragment 2
    const frag2 = Matter.Bodies.rectangle(p2X, p2Y, halfW, height, {
      angle: angle,
      density: mat.density,
      friction: 0.5,
      restitution: 0.2,
      label: 'fragment',
    });

    // Inherit motion + outward scatter impulse
    Matter.Body.setVelocity(frag1, {
      x: vel.x - cosA * 0.5 + (this.nextRandom() - 0.5),
      y: vel.y - sinA * 0.5 + (this.nextRandom() - 0.5),
    });
    Matter.Body.setAngularVelocity(frag1, angVel - 0.05);

    Matter.Body.setVelocity(frag2, {
      x: vel.x + cosA * 0.5 + (this.nextRandom() - 0.5),
      y: vel.y + sinA * 0.5 + (this.nextRandom() - 0.5),
    });
    Matter.Body.setAngularVelocity(frag2, angVel + 0.05);

    // Tag fragments
    (frag1 as any).customData = { isFragment: true, woodType };
    (frag2 as any).customData = { isFragment: true, woodType };

    this.fragmentBodies.push(frag1, frag2);

    // Remove original plank rigid body from world, add fragments
    Matter.World.remove(this.world, originalPlank);
    Matter.World.add(this.world, [frag1, frag2]);
  }

  private triggerCatHurt() {
    if (this.catHurt || this.gameState !== 'SIMULATING') return;
    this.catHurt = true;
    this.gameState = 'FAILED';
    this.callbacks.onGameStateChange('FAILED');
    this.callbacks.onSoundTrigger?.('cat_hurt');
  }

  private checkSimulationEndCondition() {
    if (this.gameState !== 'SIMULATING' || !this.currentLevel) return;

    const elapsedMs = Date.now() - this.simulationStartTime;

    // Minimum simulation duration before evaluating win
    if (elapsedMs < 2500) return;

    if (this.catHurt) return;

    // Check if all balls have come to rest or dropped safely off screen/ground
    let allBallsSettled = true;
    this.ballBodies.forEach((ball) => {
      const velSq = ball.velocity.x * ball.velocity.x + ball.velocity.y * ball.velocity.y;
      const speed = Math.sqrt(velSq);

      // If ball is still moving with high velocity, simulation is ongoing
      if (speed > 0.35 && ball.position.y < this.currentLevel!.groundY) {
        allBallsSettled = false;
      }
    });

    if (allBallsSettled || elapsedMs > 7500) {
      // A boulder can come to rest overlapping the cat without ever firing a
      // fresh collision event. Settling was previously enough to declare a win,
      // so the cat could be pinned under a boulder and still be "protected".
      if (this.isBoulderTouchingCat()) {
        this.triggerCatHurt();
        return;
      }
      this.gameState = 'WON';
      this.callbacks.onGameStateChange('WON');
      this.callbacks.onSoundTrigger?.('cat_win');
    }
  }

  /** True when any boulder is overlapping the cat's hitbox right now. */
  private isBoulderTouchingCat(): boolean {
    if (!this.catBody) return false;
    const c = this.catBody.bounds;
    for (const ball of this.ballBodies.values()) {
      const b = ball.bounds;
      if (b.min.x < c.max.x && b.max.x > c.min.x && b.min.y < c.max.y && b.max.y > c.min.y) {
        return true;
      }
    }
    return false;
  }

  private cleanupOffscreenBodies() {
    if (!this.currentLevel) return;
    const maxY = this.currentLevel.worldHeight + 200;

    // Clean up fragments that fall off screen
    const remainingFrags: Matter.Body[] = [];
    this.fragmentBodies.forEach((frag) => {
      if (frag.position.y > maxY || frag.position.x < -200 || frag.position.x > this.currentLevel!.worldWidth + 200) {
        Matter.World.remove(this.world, frag);
      } else {
        remainingFrags.push(frag);
      }
    });
    this.fragmentBodies = remainingFrags;
  }

  public stopSimulation() {
    if (this.activeAnimationFrame !== null) {
      cancelAnimationFrame(this.activeAnimationFrame);
      this.activeAnimationFrame = null;
    }
    if (this.runner) {
      Matter.Runner.stop(this.runner);
      this.runner = null;
    }
  }

  // --- GETTERS FOR RENDER LAYER (PURE READING, NO MUTATION) ---
  public getPhysicsBodies() {
    return {
      catBody: this.catBody,
      ballBodies: Array.from(this.ballBodies.values()),
      plankBodies: Array.from(this.plankBodies.values()),
      fragmentBodies: this.fragmentBodies,
      groundBody: this.groundBody,
      plankDamageStates: this.plankDamageStates,
      gameState: this.gameState,
    };
  }

  public getPlacedPlanks(): PlacedPlank[] {
    return this.placedPlanks;
  }
}
