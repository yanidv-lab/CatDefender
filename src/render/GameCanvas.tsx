import React, { useRef, useEffect, useState, useCallback } from 'react';
import Matter from 'matter-js';
import { PhysicsEngine, GameState, PlacedPlank } from '../engine/physicsEngine';
import { LevelData, PlankDamageState, WOOD_MATERIALS, WoodType } from '../entities/types';

interface GameCanvasProps {
  physicsEngine: PhysicsEngine;
  currentLevel: LevelData;
  gameState: GameState;
  placedPlanks: PlacedPlank[];
  selectedPlankId: string | null;
  onSelectPlank: (id: string | null) => void;
  onUpdatePlankPosition: (id: string, x: number, y: number) => void;
  onUpdatePlankAngle: (id: string, angle: number) => void;
  zoomLevel: number;
  panOffset: { x: number; y: number };
  onPanChange: (offset: { x: number; y: number }) => void;
  onZoomChange: (zoom: number) => void;
  onResetCamera: () => void;
}

// --- Sprite loading (claymation asset pass) ---
// Images live in /public/assets and are loaded once at module scope. Draw calls
// fall back to the original procedural shapes until (or unless) a sprite finishes
// loading, so a missing/slow asset never breaks rendering.
const spriteCache: Record<string, HTMLImageElement> = {};
function loadSprite(src: string): HTMLImageElement {
  if (!spriteCache[src]) {
    const img = new Image();
    img.src = src;
    spriteCache[src] = img;
  }
  return spriteCache[src];
}
function isReady(img: HTMLImageElement) {
  return img.complete && img.naturalWidth > 0;
}

const BOULDER_SPRITES = {
  stone: loadSprite('./assets/boulder_stone.png'),
  iron: loadSprite('./assets/boulder_iron.png'),
};
const GROUND_SPRITE = loadSprite('./assets/ground_terrain.png');
const CAT_SPRITE = loadSprite('./assets/cat_idle.png');
const CLOUD_SPRITES = [
  loadSprite('./assets/cloud_cream_1.png'),
  loadSprite('./assets/cloud_blue_1.png'),
  loadSprite('./assets/cloud_cream_2.png'),
  loadSprite('./assets/cloud_blue_2.png'),
];
const PLANK_SPRITES: Record<WoodType, HTMLImageElement> = {
  PINE: loadSprite('./assets/plank_pine.png'),
  OAK: loadSprite('./assets/plank_oak.png'),
  IRONWOOD: loadSprite('./assets/plank_ironwood.png'),
};

// Fills the current rounded-rect plank path (already begun by the caller) with the
// wood-grain sprite for its material, clipped to the plank's own shape so it works
// at any plank width/height. Falls back to the flat material color until the sprite
// image has loaded (or if it fails to).
function fillPlankTexture(ctx: CanvasRenderingContext2D, woodType: WoodType, w: number, h: number, fallbackColor: string) {
  const sprite = PLANK_SPRITES[woodType] || PLANK_SPRITES.OAK;
  if (isReady(sprite)) {
    ctx.save();
    ctx.clip();
    ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
    ctx.restore();
  } else {
    ctx.fillStyle = fallbackColor;
    ctx.fill();
  }
}

/**
 * True when a plank at this transform would overlap the cat. Since any contact
 * with the cat is a loss, letting the player park a plank inside it would be an
 * instant, unavoidable failure the moment they pressed START — so placement is
 * blocked there instead. Uses the plank's four corners plus its centre, with a
 * small margin, which is ample for a thin rectangle against a box.
 */
function overlapsCat(
  x: number,
  y: number,
  angle: number,
  w: number,
  h: number,
  cat: { x: number; y: number; width: number; height: number }
): boolean {
  const margin = 4;
  const halfW = cat.width / 2 + margin;
  const halfH = cat.height / 2 + margin;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const pts: [number, number][] = [
    [0, 0],
    [-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2],
    [-w / 4, 0], [w / 4, 0],
  ];
  return pts.some(([px, py]) => {
    const wx = x + px * cos - py * sin;
    const wy = y + px * sin + py * cos;
    return Math.abs(wx - cat.x) < halfW && Math.abs(wy - cat.y) < halfH;
  });
}

interface DebrisParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  angle: number;
  vAngle: number;
  color: string;
  life: number;
  /** Dust puffs fade and expand instead of tumbling like wood splinters. */
  dust?: boolean;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  physicsEngine,
  currentLevel,
  gameState,
  placedPlanks,
  selectedPlankId,
  onSelectPlank,
  onUpdatePlankPosition,
  onUpdatePlankAngle,
  zoomLevel,
  panOffset,
  onPanChange,
  onZoomChange,
  onResetCamera,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Particles for wooden debris scattering
  const particlesRef = useRef<DebrisParticle[]>([]);

  // Screen shake magnitude in px, decays every frame in the render loop
  const shakeRef = useRef<number>(0);
  const triggerShake = useCallback((intensity: number) => {
    shakeRef.current = Math.min(24, Math.max(shakeRef.current, intensity));
  }, []);

  // Background clouds, scattered once per level so they hold still rather than
  // re-randomizing every frame
  const cloudsRef = useRef<{ x: number; y: number; scale: number; sprite: number }[]>([]);
  useEffect(() => {
    // Clouds live in the upper sky only. The build zone is the ~300px directly
    // above the cat and must stay visually clear.
    const buildZoneTop = currentLevel.groundY - 340;
    const skyTop = 60;
    const count = 5;
    const clouds = [];
    for (let i = 0; i < count; i++) {
      const band = Math.max(80, buildZoneTop - skyTop);
      clouds.push({
        x: 40 + Math.random() * (currentLevel.worldWidth - 80),
        y: skyTop + (band / count) * i + Math.random() * (band / count) * 0.6,
        scale: 0.5 + Math.random() * 0.45,
        sprite: i,
      });
    }
    cloudsRef.current = clouds;
  }, [currentLevel.id, currentLevel.worldWidth, currentLevel.groundY]);

  // Register plank break listener on physics engine
  useEffect(() => {
    physicsEngine.setOnPlankBreak((x, y, vx, vy, width, height) => {
      const newParticles: DebrisParticle[] = [];
      const count = 26;
      const woodColors = ['#795548', '#8D6E63', '#5D4037', '#3E2723', '#D7CCC8', '#A1887F'];

      for (let i = 0; i < count; i++) {
        const offsetX = (Math.random() - 0.5) * (width * 0.8);
        const offsetY = (Math.random() - 0.5) * (height * 1.2);

        // Inherit impact velocity plus random directional scatter impulse
        const speedScale = 0.35;
        const blastX = (Math.random() - 0.5) * 8;
        const blastY = -Math.random() * 6 - 2;

        newParticles.push({
          x: x + offsetX,
          y: y + offsetY,
          vx: vx * speedScale + blastX,
          vy: vy * speedScale + blastY,
          w: 3 + Math.random() * 8,
          h: 2 + Math.random() * 5,
          angle: Math.random() * Math.PI * 2,
          vAngle: (Math.random() - 0.5) * 0.4,
          color: woodColors[Math.floor(Math.random() * woodColors.length)],
          life: 1.0,
        });
      }

      // Dust cloud alongside the splinters, so a break reads as an impact
      // rather than just wood changing shape.
      for (let i = 0; i < 14; i++) {
        newParticles.push({
          x: x + (Math.random() - 0.5) * width * 0.7,
          y: y + (Math.random() - 0.5) * height * 2,
          vx: (Math.random() - 0.5) * 3.2,
          vy: -Math.random() * 2.2 - 0.4,
          w: 7 + Math.random() * 14,
          h: 7 + Math.random() * 14,
          angle: 0,
          vAngle: 0,
          color: 'rgba(226, 214, 196, 0.75)',
          life: 1.0,
          dust: true,
        });
      }

      particlesRef.current = [...particlesRef.current, ...newParticles];
      triggerShake(10);
    });
  }, [physicsEngine, triggerShake]);

  // Register cat-impact listener to drive screen shake proportional to impact force
  useEffect(() => {
    physicsEngine.setOnCatImpact((force) => {
      triggerShake(force * 1.4);
    });
  }, [physicsEngine, triggerShake]);

  // Clear particles when resetting to editing
  useEffect(() => {
    if (gameState === 'EDITING') {
      particlesRef.current = [];
    }
  }, [gameState]);

  // Dragging state
  const [isDraggingPlank, setIsDraggingPlank] = useState(false);
  const [isRotatingPlank, setIsRotatingPlank] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [plankStartPos, setPlankStartPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [initialAngle, setInitialAngle] = useState(0);

  // Touch gesture state
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartAngleRef = useRef<number | null>(null);

  // Double-tap zoom tracking
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const [isZoomedIn, setIsZoomedIn] = useState(false);

  // Convert screen coordinates to canvas world coordinates
  const screenToWorld = useCallback(
    (screenX: number, screenY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: screenX, y: screenY };
      const rect = canvas.getBoundingClientRect();
      const rawX = screenX - rect.left;
      const rawY = screenY - rect.top;

      // Adjust for pan and zoom
      const worldX = (rawX - panOffset.x) / zoomLevel;
      const worldY = (rawY - panOffset.y) / zoomLevel;

      return { x: worldX, y: worldY };
    },
    [panOffset, zoomLevel]
  );

  // Main Render Loop
  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Handle high DPI crisp canvas sizing
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // Sky: deep at altitude, warming toward a hazy horizon so tall levels read
      // as genuinely high up rather than a flat colour field.
      const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
      skyGradient.addColorStop(0, '#3E93C9');
      skyGradient.addColorStop(0.35, '#69B4DF');
      skyGradient.addColorStop(0.72, '#A5D6EE');
      skyGradient.addColorStop(1, '#E4F3FB');
      ctx.fillStyle = skyGradient;
      ctx.fillRect(0, 0, width, height);

      // Soft sun high on the left, then a warm haze band sitting on the horizon.
      const sunX = width * 0.22;
      const sunY = height * 0.14;
      const sun = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, width * 0.55);
      sun.addColorStop(0, 'rgba(255, 246, 214, 0.55)');
      sun.addColorStop(0.28, 'rgba(255, 240, 200, 0.16)');
      sun.addColorStop(1, 'rgba(255, 240, 200, 0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, width, height);

      const haze = ctx.createLinearGradient(0, height * 0.62, 0, height);
      haze.addColorStop(0, 'rgba(255, 249, 232, 0)');
      haze.addColorStop(1, 'rgba(255, 246, 226, 0.5)');
      ctx.fillStyle = haze;
      ctx.fillRect(0, height * 0.62, width, height * 0.38);

      // Apply Camera View Transforms (Zoom & Pan) plus decaying impact shake
      let shakeX = 0;
      let shakeY = 0;
      if (shakeRef.current > 0.05) {
        shakeX = (Math.random() - 0.5) * shakeRef.current;
        shakeY = (Math.random() - 0.5) * shakeRef.current;
        shakeRef.current *= 0.88;
      } else {
        shakeRef.current = 0;
      }

      ctx.save();
      ctx.translate(panOffset.x + shakeX, panOffset.y + shakeY);
      ctx.scale(zoomLevel, zoomLevel);

      // --- 1. DRAW WORLD BACKGROUND ---
      // Clouds drift slowly so the sky is alive without pulling focus.
      const driftT = performance.now() / 1000;
      cloudsRef.current.forEach((c, i) => {
        c.x += (0.09 + (i % 3) * 0.035) * Math.sin(driftT * 0.05 + i) * 0.5 + 0.055 + (i % 3) * 0.02;
        if (c.x > currentLevel.worldWidth + 140) c.x = -140;
      });
      drawClouds(ctx, cloudsRef.current);

      // --- 2. DRAW GROUND ---
      drawGround(ctx, currentLevel);

      // --- 3. DRAW GAME BODIES FROM PHYSICS ENGINE ---
      const bodies = physicsEngine.getPhysicsBodies();

      // Draw Balls
      bodies.ballBodies.forEach((ball) => {
        drawBall(ctx, ball);
      });

      // Draw Cat
      if (bodies.catBody) {
        drawCat(ctx, bodies.catBody, gameState, currentLevel.cat.width, currentLevel.cat.height);
      }

      // While building, planks hold exactly where the player put them, so they
      // draw from the authored coordinates with their editing handles. Once the
      // level starts they are simulated and draw from their physics bodies.
      if (gameState === 'EDITING') {
        placedPlanks.forEach((plank) => {
          drawEditablePlank(ctx, plank, plank.id === selectedPlankId);
        });
      } else {
        bodies.plankBodies.forEach((plankBody) => {
          drawPhysicsPlank(ctx, plankBody, bodies.plankDamageStates);
        });
      }

      // Draw Snapped Fragments
      bodies.fragmentBodies.forEach((fragBody) => {
        drawFragment(ctx, fragBody);
      });

      // --- 4. DRAW & UPDATE WOODEN DEBRIS PARTICLES ---
      if (particlesRef.current.length > 0) {
        const gravity = 0.25;
        const nextParticles: DebrisParticle[] = [];

        for (let i = 0; i < particlesRef.current.length; i++) {
          const p = particlesRef.current[i];
          p.x += p.vx;
          p.y += p.vy;
          if (p.dust) {
            p.vx *= 0.94;
            p.vy = p.vy * 0.94 - 0.05; // drifts upward as it dissipates
            p.life -= 0.03;
          } else {
            p.vy += gravity;
            p.angle += p.vAngle;
            p.life -= 0.022;
          }

          if (p.life > 0) {
            nextParticles.push(p);

            ctx.save();
            ctx.translate(p.x, p.y);
            if (p.dust) {
              // Puffs swell and fade rather than tumbling
              const grow = 1 + (1 - p.life) * 1.5;
              ctx.globalAlpha = Math.max(0, p.life) * 0.5;
              ctx.fillStyle = p.color;
              ctx.beginPath();
              ctx.arc(0, 0, (p.w / 2) * grow, 0, Math.PI * 2);
              ctx.fill();
            } else {
              ctx.rotate(p.angle);
              ctx.globalAlpha = Math.max(0, p.life);
              ctx.fillStyle = p.color;
              ctx.beginPath();
              ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 1);
              ctx.fill();
            }
            ctx.restore();
          }
        }

        particlesRef.current = nextParticles;
      }

      ctx.restore(); // Restore camera transform

      // Gentle vignette to seat the scene and stop the corners feeling flat.
      const vignette = ctx.createRadialGradient(
        width / 2, height * 0.52, Math.min(width, height) * 0.35,
        width / 2, height * 0.52, Math.max(width, height) * 0.78
      );
      vignette.addColorStop(0, 'rgba(0, 20, 40, 0)');
      vignette.addColorStop(1, 'rgba(0, 20, 40, 0.28)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);

      ctx.restore(); // Restore dpr transform

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [physicsEngine, currentLevel, gameState, placedPlanks, selectedPlankId, zoomLevel, panOffset]);

  // Mouse / Touch Event Handlers for Placing, Moving, Rotating Planks
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Double-tap toggles zoom (replaces the old on-screen zoom buttons). Checked
    // before the editing guard so it also works while the simulation is running.
    const now = Date.now();
    const lastTap = lastTapRef.current;
    if (
      lastTap &&
      now - lastTap.t < 300 &&
      Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40
    ) {
      lastTapRef.current = null;
      if (isZoomedIn) {
        setIsZoomedIn(false);
        onResetCamera();
      } else {
        // Anchor the zoom on the tapped point so it stays put under the finger.
        const anchor = screenToWorld(e.clientX, e.clientY);
        const canvas = canvasRef.current;
        const rect = canvas?.getBoundingClientRect();
        const localX = e.clientX - (rect?.left ?? 0);
        const localY = e.clientY - (rect?.top ?? 0);
        const newZoom = Math.min(2.5, zoomLevel * 2);
        setIsZoomedIn(true);
        onZoomChange(newZoom);
        onPanChange({ x: localX - anchor.x * newZoom, y: localY - anchor.y * newZoom });
      }
      return;
    }
    lastTapRef.current = { t: now, x: e.clientX, y: e.clientY };

    if (gameState !== 'EDITING') return;

    const worldPos = screenToWorld(e.clientX, e.clientY);

    // 1. Check if clicked on a plank rotate handle
    if (selectedPlankId) {
      const selectedPlank = placedPlanks.find((p) => p.id === selectedPlankId);
      if (selectedPlank) {
        const handleDist = getRotateHandlePos(selectedPlank);
        const dist = Math.hypot(worldPos.x - handleDist.x, worldPos.y - handleDist.y);
        if (dist <= 22) {
          setIsRotatingPlank(true);
          setDragStartPos({ x: worldPos.x, y: worldPos.y });
          const initialRad = Math.atan2(worldPos.y - selectedPlank.y, worldPos.x - selectedPlank.x);
          setInitialAngle(selectedPlank.angle - initialRad);
          return;
        }
      }
    }

    // 2. Any plank can be picked up and repositioned right up until the level
    //    starts. Topmost first, so overlapping planks select predictably.
    let hitPlank: PlacedPlank | null = null;
    for (let i = placedPlanks.length - 1; i >= 0; i--) {
      if (isPointInsidePlank(worldPos.x, worldPos.y, placedPlanks[i])) {
        hitPlank = placedPlanks[i];
        break;
      }
    }

    if (hitPlank) {
      onSelectPlank(hitPlank.id);
      setIsDraggingPlank(true);
      setDragStartPos({ x: worldPos.x, y: worldPos.y });
      setPlankStartPos({ x: hitPlank.x, y: hitPlank.y });
    } else {
      // Clicked on empty space -> deselect plank, start canvas panning
      onSelectPlank(null);
      setIsPanning(true);
      setDragStartPos({ x: e.clientX, y: e.clientY });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gameState !== 'EDITING') return;

    if (isRotatingPlank && selectedPlankId) {
      const selectedPlank = placedPlanks.find((p) => p.id === selectedPlankId);
      if (selectedPlank) {
        const worldPos = screenToWorld(e.clientX, e.clientY);
        const newRad = Math.atan2(worldPos.y - selectedPlank.y, worldPos.x - selectedPlank.x);
        let finalAngle = newRad + initialAngle;

        // Snap to nearest 15 deg if close
        const degrees = (finalAngle * 180) / Math.PI;
        const snapDegrees = Math.round(degrees / 15) * 15;
        if (Math.abs(degrees - snapDegrees) < 4) {
          finalAngle = (snapDegrees * Math.PI) / 180;
        }

        onUpdatePlankAngle(selectedPlankId, finalAngle);
      }
    } else if (isDraggingPlank && selectedPlankId) {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      const deltaX = worldPos.x - dragStartPos.x;
      const deltaY = worldPos.y - dragStartPos.y;

      let newX = plankStartPos.x + deltaX;
      let newY = plankStartPos.y + deltaY;

      // Clamp within world boundaries
      newX = Math.max(40, Math.min(currentLevel.worldWidth - 40, newX));
      newY = Math.max(60, Math.min(currentLevel.groundY - 10, newY));

      // Refuse positions that overlap the cat rather than allowing a placement
      // that would fail instantly on START.
      const plank = placedPlanks.find((p) => p.id === selectedPlankId);
      if (plank && overlapsCat(newX, newY, plank.angle, plank.width, plank.height, currentLevel.cat)) {
        return;
      }

      onUpdatePlankPosition(selectedPlankId, newX, newY);
    } else if (isPanning) {
      const deltaX = e.clientX - dragStartPos.x;
      const deltaY = e.clientY - dragStartPos.y;
      onPanChange({ x: panOffset.x + deltaX, y: panOffset.y + deltaY });
      setDragStartPos({ x: e.clientX, y: e.clientY });
    }
  };

  const handlePointerUp = () => {
    setIsDraggingPlank(false);
    setIsRotatingPlank(false);
    setIsPanning(false);
    touchStartDistRef.current = null;
    touchStartAngleRef.current = null;
  };

  // Wheel Zoom
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
  };

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        className="w-full h-full cursor-grab active:cursor-grabbing touch-none block"
      />
    </div>
  );
};

// --- RENDER HELPER DRAWING FUNCTIONS ---

function drawClouds(ctx: CanvasRenderingContext2D, clouds: { x: number; y: number; scale: number; sprite: number }[]) {
  ctx.save();
  clouds.forEach((cloud) => {
    const sprite = CLOUD_SPRITES[cloud.sprite % CLOUD_SPRITES.length];
    if (isReady(sprite)) {
      const w = 150 * cloud.scale;
      const h = (sprite.naturalHeight / sprite.naturalWidth) * w;
      ctx.drawImage(sprite, cloud.x - w / 2, cloud.y - h / 2, w, h);
    } else {
      // Soft fallback while the sprite loads
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      const s = cloud.scale;
      ctx.beginPath();
      ctx.ellipse(cloud.x, cloud.y, 34 * s, 18 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(cloud.x + 30 * s, cloud.y + 4 * s, 26 * s, 15 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.restore();
}

function drawGround(ctx: CanvasRenderingContext2D, level: LevelData) {
  ctx.save();
  const groundY = level.groundY;
  const groundHeight = 120;
  // Overdraw well past the world bounds so no sky is ever visible beside or
  // beneath the terrain, whatever the screen aspect and camera anchor.
  const bleed = Math.max(level.worldWidth, level.worldHeight);

  if (isReady(GROUND_SPRITE)) {
    // Claymation grass-over-dirt texture; slight overlap above groundY so the
    // grass edge reads naturally under planks/the cat resting on the line.
    const topOverlap = 14;
    ctx.drawImage(GROUND_SPRITE, 0, groundY - topOverlap, level.worldWidth, groundHeight + topOverlap);
    // Extend the dirt tone below and to the sides of the textured strip.
    ctx.fillStyle = '#B07C42';
    ctx.fillRect(-bleed, groundY + groundHeight - 2, level.worldWidth + bleed * 2, bleed);
    ctx.fillRect(-bleed, groundY, bleed, bleed);
    ctx.fillRect(level.worldWidth, groundY, bleed, bleed);
    ctx.restore();
    return;
  }

  // Fallback procedural ground while the texture loads (or if it fails to load)
  // Primary ground accent line
  ctx.fillStyle = '#005AC1';
  ctx.fillRect(0, groundY - 2, level.worldWidth, 4);

  // Ground base surface
  ctx.fillStyle = '#D1D1D1';
  ctx.fillRect(0, groundY + 2, level.worldWidth, groundHeight);

  // Border line
  ctx.strokeStyle = '#A0A0A0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, groundY + 2);
  ctx.lineTo(level.worldWidth, groundY + 2);
  ctx.stroke();

  // Geometric ground accent pattern
  ctx.fillStyle = '#C4C6D0';
  for (let x = 30; x < level.worldWidth; x += 80) {
    ctx.fillRect(x, groundY + 20, 24, 12);
  }

  ctx.restore();
}

function drawBall(ctx: CanvasRenderingContext2D, ball: Matter.Body) {
  ctx.save();
  ctx.translate(ball.position.x, ball.position.y);
  ctx.rotate(ball.angle);

  const radius = (ball as any).circleRadius || 30;
  const material: 'stone' | 'iron' = (ball as any).customData?.material === 'iron' ? 'iron' : 'stone';
  const sprite = BOULDER_SPRITES[material];

  // Motion streak once it is genuinely moving, so speed reads at a glance.
  const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
  if (speed > 4) {
    const len = Math.min(radius * 3.4, speed * 5);
    const nx = ball.velocity.x / speed;
    const ny = ball.velocity.y / speed;
    ctx.save();
    ctx.rotate(-ball.angle); // streak follows world motion, not the body's spin
    const trail = ctx.createLinearGradient(0, 0, -nx * len, -ny * len);
    trail.addColorStop(0, 'rgba(255,255,255,0.30)');
    trail.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = trail;
    ctx.beginPath();
    ctx.moveTo(-ny * radius * 0.85, nx * radius * 0.85);
    ctx.lineTo(ny * radius * 0.85, -nx * radius * 0.85);
    ctx.lineTo(-nx * len, -ny * len);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  if (isReady(sprite)) {
    // Claymation boulder sprite (rotation-safe: a sphere reads correctly from any angle)
    ctx.drawImage(sprite, -radius, -radius, radius * 2, radius * 2);
    ctx.restore();
    return;
  }

  // Fallback while the sprite loads (or if it fails to load)
  // Dark slate stone/iron ball with crisp border (Design theme `#44474F` with `#1B1B1F`)
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#44474F';
  ctx.fill();

  ctx.lineWidth = 4;
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke();

  // Inner shading arc
  ctx.beginPath();
  ctx.arc(0, 0, radius - 2, 0, Math.PI);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.restore();
}

function drawCat(
  ctx: CanvasRenderingContext2D,
  catBody: Matter.Body,
  gameState: GameState,
  catWidth: number,
  catHeight: number
) {
  ctx.save();
  ctx.translate(catBody.position.x, catBody.position.y);

  if (isReady(CAT_SPRITE)) {
    // Sprite art is drawn a little larger than the hitbox and anchored so its
    // feet sit on the ground line rather than centred on the box.
    const drawW = catWidth * 1.75;
    const drawH = (CAT_SPRITE.naturalHeight / CAT_SPRITE.naturalWidth) * drawW;
    ctx.drawImage(CAT_SPRITE, -drawW / 2, catHeight / 2 - drawH, drawW, drawH);
    ctx.restore();
    return;
  }

  // The physics hitbox is intentionally smaller than the cat, so the drawing
  // scale comes from the level config rather than the body's own bounds.
  ctx.scale(catWidth / 48, catHeight / 48);

  const width = 48;
  const height = 48;

  // Cat Body (Warm Golden `#FFB300`)
  ctx.fillStyle = '#FFB300';
  ctx.beginPath();
  ctx.roundRect(-width / 2, -height / 2, width, height, 16);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#E65100';
  ctx.stroke();

  // Cat Ears
  ctx.fillStyle = '#FF8F00';
  // Left ear
  ctx.beginPath();
  ctx.moveTo(-width / 2 + 4, -height / 2);
  ctx.lineTo(-width / 2 - 4, -height / 2 - 14);
  ctx.lineTo(-width / 2 + 16, -height / 2);
  ctx.fill();
  ctx.stroke();

  // Right ear
  ctx.beginPath();
  ctx.moveTo(width / 2 - 4, -height / 2);
  ctx.lineTo(width / 2 + 4, -height / 2 - 14);
  ctx.lineTo(width / 2 - 16, -height / 2);
  ctx.fill();
  ctx.stroke();

  // Inner ear pink
  ctx.fillStyle = '#FFE082';
  ctx.beginPath();
  ctx.moveTo(-width / 2 + 5, -height / 2 + 2);
  ctx.lineTo(-width / 2 - 1, -height / 2 - 9);
  ctx.lineTo(-width / 2 + 13, -height / 2 + 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(width / 2 - 5, -height / 2 + 2);
  ctx.lineTo(width / 2 + 1, -height / 2 - 9);
  ctx.lineTo(width / 2 - 13, -height / 2 + 2);
  ctx.fill();

  // Cat Face Expressions depending on GameState
  ctx.fillStyle = '#1B1B1F';
  if (gameState === 'FAILED') {
    // Hurt/X eyes
    drawXEye(ctx, -12, -4);
    drawXEye(ctx, 12, -4);
  } else if (gameState === 'WON') {
    // Happy arch eyes
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(-12, -4, 5, Math.PI, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(12, -4, 5, Math.PI, 0);
    ctx.stroke();
  } else {
    // Normal cute big eyes
    ctx.beginPath();
    ctx.arc(-12, -4, 5, 0, Math.PI * 2);
    ctx.arc(12, -4, 5, 0, Math.PI * 2);
    ctx.fill();

    // Eye catchlights
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-10, -6, 2, 0, Math.PI * 2);
    ctx.arc(14, -6, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cute Nose & Whiskers
  ctx.fillStyle = '#D81B60';
  ctx.beginPath();
  ctx.arc(0, 4, 3, 0, Math.PI * 2);
  ctx.fill();

  // Whiskers
  ctx.strokeStyle = '#5D4037';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-16, 4); ctx.lineTo(-28, 0);
  ctx.moveTo(-16, 8); ctx.lineTo(-28, 8);
  ctx.moveTo(16, 4);  ctx.lineTo(28, 0);
  ctx.moveTo(16, 8);  ctx.lineTo(28, 8);
  ctx.stroke();

  ctx.restore();
}

function drawXEye(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.strokeStyle = '#1B1B1F';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4);
  ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4);
  ctx.stroke();
}

function drawEditablePlank(ctx: CanvasRenderingContext2D, plank: PlacedPlank, isSelected: boolean) {
  ctx.save();
  ctx.translate(plank.x, plank.y);
  ctx.rotate(plank.angle);

  const w = plank.width;
  const h = plank.height;
  const woodType: WoodType = plank.woodType || 'OAK';
  const mat = WOOD_MATERIALS[woodType] || WOOD_MATERIALS.OAK;

  // Wood Plank Body
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 6);
  fillPlankTexture(ctx, woodType, w, h, mat.color);

  ctx.strokeStyle = mat.borderColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Border selection outline
  if (isSelected) {
    ctx.strokeStyle = '#005AC1'; // Vibrant material blue selection ring
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Rotate handle arm & handle knob
    ctx.restore(); // Undo plank angle for handle drawing
    ctx.save();

    const handlePos = getRotateHandlePos(plank);
    ctx.strokeStyle = '#005AC1';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(plank.x, plank.y);
    ctx.lineTo(handlePos.x, handlePos.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Knob
    ctx.fillStyle = '#005AC1';
    ctx.beginPath();
    ctx.arc(handlePos.x, handlePos.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();

    // Rotate icon arrows inside knob
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(handlePos.x, handlePos.y, 7, 0, Math.PI * 1.5);
    ctx.stroke();

    ctx.restore();
    return;
  }

  ctx.restore();
}

function drawPhysicsPlank(
  ctx: CanvasRenderingContext2D,
  plankBody: Matter.Body,
  damageStates: Map<string, PlankDamageState>
) {
  const data = plankBody.customData;
  if (!data || !data.plankId) return;

  const damage = damageStates.get(data.plankId);
  const isCracked = damage?.isCracked || false;
  const woodType: WoodType = (data as any)?.woodType || 'OAK';
  const mat = WOOD_MATERIALS[woodType] || WOOD_MATERIALS.OAK;

  ctx.save();
  ctx.translate(plankBody.position.x, plankBody.position.y);
  ctx.rotate(plankBody.angle);

  const w = data.width || 140;
  const h = data.height || 18;

  // Wood Plank Body
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 6);
  fillPlankTexture(ctx, woodType, w, h, mat.color);

  ctx.strokeStyle = mat.borderColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Damage overlay: a branching split across the grain plus a darkened core, so
  // a weakened plank is obvious before it finally snaps.
  if (isCracked) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = 'rgba(20, 12, 8, 0.9)';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    const seed = (data.plankId || '').length;
    for (let i = -1; i <= 1; i++) {
      const cx = (w / 4) * i + ((seed % 3) - 1) * 6;
      ctx.beginPath();
      ctx.moveTo(cx - 4, -h / 2);
      ctx.lineTo(cx + 3, -h * 0.1);
      ctx.lineTo(cx - 2, h * 0.15);
      ctx.lineTo(cx + 5, h / 2);
      ctx.stroke();
    }
    // Fine hairlines branching off the main splits
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    for (let i = -1; i <= 1; i++) {
      const cx = (w / 4) * i;
      ctx.beginPath();
      ctx.moveTo(cx + 3, -h * 0.1);
      ctx.lineTo(cx + 14, -h * 0.3);
      ctx.moveTo(cx - 2, h * 0.15);
      ctx.lineTo(cx - 13, h * 0.34);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.restore();
}

function drawFragment(ctx: CanvasRenderingContext2D, fragBody: Matter.Body) {
  ctx.save();
  ctx.translate(fragBody.position.x, fragBody.position.y);
  ctx.rotate(fragBody.angle);

  // Read bounds or dimensions
  const minX = fragBody.bounds.min.x;
  const maxX = fragBody.bounds.max.x;
  const w = Math.max(30, maxX - minX);
  const h = 18;

  const data = fragBody.customData;
  const woodType: WoodType = (data as any)?.woodType || 'OAK';
  const mat = WOOD_MATERIALS[woodType] || WOOD_MATERIALS.OAK;

  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 4);
  fillPlankTexture(ctx, woodType, w, h, mat.color);

  // Jagged fracture edge
  ctx.strokeStyle = mat.borderColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

// Helpers
function getRotateHandlePos(plank: PlacedPlank) {
  const handleRadius = plank.width / 2 + 35;
  return {
    x: plank.x + handleRadius * Math.cos(plank.angle),
    y: plank.y + handleRadius * Math.sin(plank.angle),
  };
}

function isPointInsidePlank(px: number, py: number, plank: PlacedPlank): boolean {
  const dx = px - plank.x;
  const dy = py - plank.y;
  const cos = Math.cos(-plank.angle);
  const sin = Math.sin(-plank.angle);

  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  const halfW = plank.width / 2 + 10;
  const halfH = plank.height / 2 + 10;

  return Math.abs(localX) <= halfW && Math.abs(localY) <= halfH;
}
