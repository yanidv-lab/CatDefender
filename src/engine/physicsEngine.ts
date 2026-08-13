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
  /**
   * False while the player is still positioning this plank (held in place,
   * ignoring gravity). Once committed it becomes a dynamic body and will fall
   * and settle unless the rest of the structure supports it.
   */
  committed?: boolean;
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

    // 2. Create Cat Hitbox.
    // Deliberately smaller than the drawn cat: a shelter's legs naturally come
    // to rest right beside the cat, and a full-size box would count that
    // harmless brush as a killing blow. Only the cat's core counts as a hit.
    const HITBOX_SCALE = 0.55;
    this.catBody = Matter.Bodies.rectangle(
      level.cat.x,
      level.cat.y,
      level.cat.width * HITBOX_SCALE,
      level.cat.height * HITBOX_SCALE,
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
          // A committed plank is live immediately, so the structure settles as
          // it is built; only the plank currently being positioned is held.
          isStatic: !p.committed,
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

    // Start stepping straight away so placed planks settle during the build.
    this.stopSimulation();
    this.activeAnimationFrame = requestAnimationFrame(this.runLoop);
  }

  /**
   * Reconciles the world with the player's plank list without rebuilding it.
   * A full rebuild would snap already-settled planks back to their authored
   * coordinates, so committed bodies are left alone and only additions,
   * removals and the in-hand plank's transform are applied.
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
      const data = (existing as any).customData;
      if (p.committed && data && !data.committed) {
        // Player confirmed placement: hand it over to gravity.
        data.committed = true;
        Matter.Body.setStatic(existing, false);
        Matter.Body.setVelocity(existing, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(existing, 0);
        Matter.Sleeping.set(existing, false);
      } else if (!p.committed) {
        // Still being positioned — follow the player's drag exactly.
        Matter.Body.setPosition(existing, { x: p.x, y: p.y });
        Matter.Body.setAngle(existing, p.angle);
      }
    });

    this.callbacks.onPlankDamageUpdate(new Map(this.plankDamageStates));
  }

  private addPlankBody(p: PlacedPlank) {
    const wType = p.woodType || 'OAK';
    const mat = WOOD_MATERIALS[wType] || WOOD_MATERIALS.OAK;

    const plankBody = Matter.Bodies.rectangle(p.x, p.y, p.width, p.height, {
      isStatic: !p.committed,
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
      committed: !!p.committed,
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

    // 1. Anything still held in hand is committed now, so the whole structure
    //    is live before the boulder is released.
    this.plankBodies.forEach((plankBody) => {
      const data = (plankBody as any).customData;
      if (data) data.committed = true;
      if (plankBody.isStatic) {
        Matter.Body.setStatic(plankBody, false);
        Matter.Body.setSpeed(plankBody, 0);
      }
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
    // The loop is already running from the editing phase; it simply keeps going
    // now that gameState is SIMULATING and the balls have been released.
  }

  private runLoop = () => {
    // The loop runs during EDITING too, so committed planks fall and settle
    // while the shelter is being built. Only win/lose evaluation is gated.
    if (this.gameState !== 'SIMULATING' && this.gameState !== 'EDITING') return;

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

        if (speed < 0.5) return; // Ignore minor sliding contacts

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
        if (bodyA.label === 'cat' || bodyB.label === 'cat') {
          const otherBody = bodyA.label === 'cat' ? bodyB : bodyA;
          // Ignore ground touching cat
          if (otherBody.label !== 'ground' && otherBody.label !== 'wall') {
            const catThreshold = this.currentLevel?.cat.maxDamageForce || 8.0;
            if (impactForce > this.maxCatImpactForce) {
              this.maxCatImpactForce = Math.round(impactForce * 10) / 10;
            }
            if (impactForce > 0.8) {
              this.callbacks.onCatImpact(impactForce);
            }
            if (impactForce >= catThreshold) {
              this.triggerCatHurt();
            }
          }
        }

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
    // Damage calculation
    const damage = (force - forceThreshold) * 7.5;
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
      x: vel.x - cosA * 0.5 + (Math.random() - 0.5),
      y: vel.y - sinA * 0.5 + (Math.random() - 0.5),
    });
    Matter.Body.setAngularVelocity(frag1, angVel - 0.05);

    Matter.Body.setVelocity(frag2, {
      x: vel.x + cosA * 0.5 + (Math.random() - 0.5),
      y: vel.y + sinA * 0.5 + (Math.random() - 0.5),
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

    // Timeout safety win check after 7 seconds if cat unharmed
    if (allBallsSettled || elapsedMs > 7500) {
      if (!this.catHurt) {
        this.gameState = 'WON';
        this.callbacks.onGameStateChange('WON');
        this.callbacks.onSoundTrigger?.('cat_win');
      }
    }
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
