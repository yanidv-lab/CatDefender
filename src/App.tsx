import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { PhysicsEngine, GameState, PlacedPlank } from './engine/physicsEngine';
import { GAME_LEVELS } from './entities/levels';
import { GameCanvas } from './render/GameCanvas';
import { GameHUD } from './render/GameHUD';
import { LevelData, SimulationStats, WoodType } from './entities/types';
import { STARTING_POINTS, calculateLevelScore, plankPrice } from './entities/economy';
import { soundManager, SoundType } from './engine/soundEffects';
import { triggerHaptic } from './engine/haptics';

const EMPTY_STATS: SimulationStats = {
  maxImpactForce: 0,
  catImpactForce: 0,
  planksCrackedCount: 0,
  planksBrokenCount: 0,
  timeElapsedSeconds: 0,
  ballAltitudeMeters: 0,
};

export const App: React.FC = () => {
  // Points are the persistent currency: earned by clearing levels, spent on planks.
  const [points, setPoints] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('cat_defender_points');
      return saved ? Math.max(0, parseInt(saved, 10)) : STARTING_POINTS;
    } catch {
      return STARTING_POINTS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('cat_defender_points', points.toString());
    } catch {
      // ignore storage access errors
    }
  }, [points]);

  const [bestLevel, setBestLevel] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('cat_defender_best_level');
      return saved ? Math.max(1, parseInt(saved, 10)) : 1;
    } catch {
      return 1;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('cat_defender_best_level', bestLevel.toString());
    } catch {
      // ignore storage access errors
    }
  }, [bestLevel]);

  const [currentLevelId, setCurrentLevelId] = useState<number>(1);
  const currentLevel: LevelData = useMemo(() => {
    return GAME_LEVELS.find((l) => l.id === currentLevelId) || GAME_LEVELS[0];
  }, [currentLevelId]);

  const [gameState, setGameState] = useState<GameState>('EDITING');
  const [placedPlanks, setPlacedPlanks] = useState<PlacedPlank[]>([]);
  const [selectedPlankId, setSelectedPlankId] = useState<string | null>(null);

  // The plank currently held in hand (positioned but not yet committed).
  const [heldPlankId, setHeldPlankId] = useState<string | null>(null);

  // Points banked at the moment the level was won, so the win screen can show
  // the score for that run rather than the running total.
  const [lastRunScore, setLastRunScore] = useState<number>(0);

  // Camera transforms
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [simulationStats, setSimulationStats] = useState<SimulationStats>(EMPTY_STATS);

  // Physics Engine Instance
  const physicsEngineRef = useRef<PhysicsEngine | null>(null);

  if (!physicsEngineRef.current) {
    physicsEngineRef.current = new PhysicsEngine({
      onGameStateChange: (state) => setGameState(state),
      onPlankDamageUpdate: () => {},
      onCatImpact: () => {},
      onStatsUpdate: (stats) => setSimulationStats(stats),
      onSoundTrigger: (type: SoundType) => {
        soundManager.play(type);
        triggerHaptic(type);
      },
    });
  }

  // Auto fit camera zoom to current level dimensions & screen size
  const fitCameraToLevel = useCallback((level: LevelData) => {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    // Scale purely by width. Every level shares the same world width, so this
    // keeps the cat, planks and boulders a constant on-screen size no matter how
    // high the drop is — tall levels extend upward off-screen and the boulder
    // falls into frame, rather than the whole scene shrinking to fit.
    const zoom = screenWidth / level.worldWidth;

    // Anchor the ground low so the cat sits on the floor of the screen and the
    // sky fills everything above it, edge to edge.
    const offsetY = screenHeight * 0.84 - level.groundY * zoom;

    setZoomLevel(zoom);
    setPanOffset({ x: 0, y: offsetY });
  }, []);

  // Initialize Level
  const loadLevel = useCallback(
    (levelId: number) => {
      const lvl = GAME_LEVELS.find((l) => l.id === levelId) || GAME_LEVELS[0];
      setCurrentLevelId(lvl.id);
      setSelectedPlankId(null);
      setGameState('EDITING');
      setSimulationStats(EMPTY_STATS);
      setLastRunScore(0);

      // Levels start empty — the player places every plank themselves from the
      // inventory rail, so the shelter is entirely their design.
      setPlacedPlanks([]);
      setHeldPlankId(null);
      physicsEngineRef.current?.initLevel(lvl, []);
      fitCameraToLevel(lvl);
    },
    [fitCameraToLevel]
  );

  useEffect(() => {
    loadLevel(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Award points on a win; a loss sends the player back to level 1.
  useEffect(() => {
    if (gameState === 'WON') {
      const score = calculateLevelScore(currentLevel.reward, placedPlanks.length);
      setLastRunScore(score);
      setPoints((p) => p + score);
      setBestLevel((b) => Math.max(b, currentLevel.id + 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  // Window resize handler
  useEffect(() => {
    const handleResize = () => fitCameraToLevel(currentLevel);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentLevel, fitCameraToLevel]);

  const syncPlanks = (updated: PlacedPlank[]) => {
    setPlacedPlanks(updated);
    physicsEngineRef.current?.updatePlacedPlanks(updated);
  };

  /**
   * Tapping a wood tile charges its price straight away and drops a fresh plank
   * into the build area, held in hand until the player confirms placement. The
   * usable supply is therefore simply what the points balance can afford.
   */
  const handleSpawnPlank = (woodType: WoodType) => {
    if (heldPlankId) return; // finish placing the current plank first
    const price = plankPrice(woodType);
    if (points < price) return;

    setPoints((p) => p - price);

    const newPlankId = `plank_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const newPlank: PlacedPlank = {
      id: newPlankId,
      x: currentLevel.cat.x,
      y: currentLevel.cat.y - 150,
      width: currentLevel.defaultPlankWidth,
      height: currentLevel.defaultPlankHeight,
      angle: 0,
      woodType,
      committed: false,
    };

    syncPlanks([...placedPlanks, newPlank]);
    setHeldPlankId(newPlankId);
    setSelectedPlankId(newPlankId);
    soundManager.play('ui_click');
    triggerHaptic('ui_click');
  };

  /** Confirms the held plank: it becomes dynamic and falls unless supported. */
  const handleCommitPlank = () => {
    if (!heldPlankId) return;
    syncPlanks(placedPlanks.map((p) => (p.id === heldPlankId ? { ...p, committed: true } : p)));
    setHeldPlankId(null);
    setSelectedPlankId(null);
    soundManager.play('wood_impact');
    triggerHaptic('wood_impact');
  };

  /** Removing a plank refunds its price. */
  const handleRemovePlank = (id: string) => {
    const plank = placedPlanks.find((p) => p.id === id);
    if (plank) setPoints((pt) => pt + plankPrice(plank.woodType || 'OAK'));
    if (selectedPlankId === id) setSelectedPlankId(null);
    if (heldPlankId === id) setHeldPlankId(null);
    syncPlanks(placedPlanks.filter((p) => p.id !== id));
  };

  const handleUpdatePlankPosition = (id: string, x: number, y: number) => {
    syncPlanks(placedPlanks.map((p) => (p.id === id ? { ...p, x, y } : p)));
  };

  const handleUpdatePlankAngle = (id: string, angle: number) => {
    syncPlanks(placedPlanks.map((p) => (p.id === id ? { ...p, angle } : p)));
  };

  const handleRotatePlankStep = (id: string, deltaDegrees: number) => {
    const plank = placedPlanks.find((p) => p.id === id);
    if (!plank) return;
    handleUpdatePlankAngle(id, plank.angle + (deltaDegrees * Math.PI) / 180);
  };

  const handleSetPlankAngle = (id: string, angleDegrees: number) => {
    handleUpdatePlankAngle(id, (angleDegrees * Math.PI) / 180);
  };

  const handleStartDrop = () => {
    setSelectedPlankId(null);
    physicsEngineRef.current?.startDropSimulation();
  };

  /** Back to the build phase with the same shelter still standing. */
  const handleResetLevel = () => {
    physicsEngineRef.current?.initLevel(currentLevel, placedPlanks);
    setSelectedPlankId(null);
    setGameState('EDITING');
    setSimulationStats(EMPTY_STATS);
  };

  const handleReplay = () => {
    if (!physicsEngineRef.current) return;
    physicsEngineRef.current.initLevel(currentLevel, placedPlanks);
    physicsEngineRef.current.startDropSimulation();
    setSelectedPlankId(null);
  };

  const handleNextLevel = () => {
    const nextId = currentLevel.id + 1;
    loadLevel(nextId <= GAME_LEVELS.length ? nextId : 1);
  };

  /** Failing the run resets progress to level 1. */
  const handleRestartRun = () => loadLevel(1);

  const handleResetCamera = () => fitCameraToLevel(currentLevel);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#5FADD9] font-sans">
      {physicsEngineRef.current && (
        <GameCanvas
          physicsEngine={physicsEngineRef.current}
          currentLevel={currentLevel}
          gameState={gameState}
          placedPlanks={placedPlanks}
          selectedPlankId={selectedPlankId}
          onSelectPlank={setSelectedPlankId}
          onUpdatePlankPosition={handleUpdatePlankPosition}
          onUpdatePlankAngle={handleUpdatePlankAngle}
          zoomLevel={zoomLevel}
          panOffset={panOffset}
          onPanChange={setPanOffset}
          onZoomChange={setZoomLevel}
          onResetCamera={handleResetCamera}
        />
      )}

      <GameHUD
        currentLevel={currentLevel}
        totalLevels={GAME_LEVELS.length}
        bestLevel={bestLevel}
        gameState={gameState}
        points={points}
        heldPlankId={heldPlankId}
        placedPlanks={placedPlanks}
        selectedPlankId={selectedPlankId}
        simulationStats={simulationStats}
        lastRunScore={lastRunScore}
        onSpawnPlank={handleSpawnPlank}
        onCommitPlank={handleCommitPlank}
        onRemovePlank={handleRemovePlank}
        onRotatePlankStep={handleRotatePlankStep}
        onSetPlankAngle={handleSetPlankAngle}
        onStartDrop={handleStartDrop}
        onResetLevel={handleResetLevel}
        onReplay={handleReplay}
        onNextLevel={handleNextLevel}
        onRestartRun={handleRestartRun}
      />
    </div>
  );
};
