import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { PhysicsEngine, GameState, PlacedPlank } from './engine/physicsEngine';
import { GAME_LEVELS } from './entities/levels';
import { GameCanvas } from './render/GameCanvas';
import { GameHUD } from './render/GameHUD';
import { LevelData, SimulationStats, WoodType } from './entities/types';
import { soundManager, SoundType } from './engine/soundEffects';
import { triggerHaptic } from './engine/haptics';
import { calculateStars } from './engine/scoring';

export const App: React.FC = () => {
  // Persistent unlocked level progress state
  const [maxUnlockedLevel, setMaxUnlockedLevel] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('cat_defender_max_unlocked_level');
      return saved ? Math.max(1, parseInt(saved, 10)) : 1;
    } catch {
      return 1;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('cat_defender_max_unlocked_level', maxUnlockedLevel.toString());
    } catch (e) {
      // ignore storage access errors
    }
  }, [maxUnlockedLevel]);

  const [selectedWoodType, setSelectedWoodType] = useState<WoodType>('OAK');
  const [currentLevelId, setCurrentLevelId] = useState<number>(1);
  const currentLevel: LevelData = useMemo(() => {
    return GAME_LEVELS.find((l) => l.id === currentLevelId) || GAME_LEVELS[0];
  }, [currentLevelId]);

  const [gameState, setGameState] = useState<GameState>('EDITING');
  const [placedPlanks, setPlacedPlanks] = useState<PlacedPlank[]>([]);
  const [selectedPlankId, setSelectedPlankId] = useState<string | null>(null);

  // Camera transforms
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Stats
  const [simulationStats, setSimulationStats] = useState<SimulationStats>({
    maxImpactForce: 0,
    planksCrackedCount: 0,
    planksBrokenCount: 0,
    timeElapsedSeconds: 0,
  });

  // Per-level best star rating (1-3), persisted locally
  const [levelStars, setLevelStars] = useState<Record<number, number>>(() => {
    try {
      const saved = localStorage.getItem('cat_defender_level_stars');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

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

  // Unlock next level & record star rating upon WIN
  useEffect(() => {
    if (gameState === 'WON') {
      const nextLevelId = currentLevel.id + 1;
      if (nextLevelId <= GAME_LEVELS.length && nextLevelId > maxUnlockedLevel) {
        setMaxUnlockedLevel(nextLevelId);
      }

      const earnedStars = calculateStars(simulationStats, currentLevel);
      setLevelStars((prev) => {
        const best = Math.max(prev[currentLevel.id] || 0, earnedStars);
        if (best === prev[currentLevel.id]) return prev;
        const updated = { ...prev, [currentLevel.id]: best };
        try {
          localStorage.setItem('cat_defender_level_stars', JSON.stringify(updated));
        } catch {
          // ignore storage access errors
        }
        return updated;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  // Auto fit camera zoom to current level dimensions & screen size
  const fitCameraToLevel = useCallback((level: LevelData) => {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    const scaleX = screenWidth / level.worldWidth;
    const scaleY = screenHeight / level.worldHeight;
    const fitScale = Math.min(scaleX, scaleY) * 0.95;

    const initialZoom = Math.max(0.65, Math.min(1.2, fitScale));
    const offsetX = (screenWidth - level.worldWidth * initialZoom) / 2;
    const offsetY = (screenHeight - level.worldHeight * initialZoom) / 2;

    setZoomLevel(initialZoom);
    setPanOffset({ x: Math.max(0, offsetX), y: Math.max(0, offsetY) });
  }, []);

  // Initialize Level
  const loadLevel = useCallback(
    (levelId: number) => {
      const lvl = GAME_LEVELS.find((l) => l.id === levelId) || GAME_LEVELS[0];
      setCurrentLevelId(lvl.id);
      setSelectedPlankId(null);
      setGameState('EDITING');
      setSimulationStats({
        maxImpactForce: 0,
        planksCrackedCount: 0,
        planksBrokenCount: 0,
        timeElapsedSeconds: 0,
      });

      // Provide initial 1-2 planks placed in default positions over cat
      const defaultPlanks: PlacedPlank[] = [
        {
          id: 'plank_init_1',
          x: lvl.cat.x - 30,
          y: lvl.cat.y - 80,
          width: lvl.defaultPlankWidth,
          height: lvl.defaultPlankHeight,
          angle: -0.25, // -14 degrees sloped roof
          woodType: 'OAK',
        },
      ];

      setPlacedPlanks(defaultPlanks);
      physicsEngineRef.current?.initLevel(lvl, defaultPlanks);
      fitCameraToLevel(lvl);
    },
    [fitCameraToLevel]
  );

  useEffect(() => {
    loadLevel(currentLevelId);
  }, []);

  // Window resize handler
  useEffect(() => {
    const handleResize = () => {
      fitCameraToLevel(currentLevel);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentLevel, fitCameraToLevel]);

  // Plank Management Handlers
  const handleAddPlank = () => {
    if (placedPlanks.length >= currentLevel.availablePlanksCount) return;

    const newPlankId = `plank_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const newPlank: PlacedPlank = {
      id: newPlankId,
      x: currentLevel.cat.x + (placedPlanks.length % 2 === 0 ? 40 : -40),
      y: currentLevel.cat.y - 120 - placedPlanks.length * 20,
      width: currentLevel.defaultPlankWidth,
      height: currentLevel.defaultPlankHeight,
      angle: 0,
      woodType: selectedWoodType,
    };

    const updatedPlanks = [...placedPlanks, newPlank];
    setPlacedPlanks(updatedPlanks);
    setSelectedPlankId(newPlankId);
    physicsEngineRef.current?.updatePlacedPlanks(updatedPlanks);
  };

  const handleUpdatePlankWoodType = (id: string, woodType: WoodType) => {
    setSelectedWoodType(woodType);
    const updated = placedPlanks.map((p) => (p.id === id ? { ...p, woodType } : p));
    setPlacedPlanks(updated);
    physicsEngineRef.current?.updatePlacedPlanks(updated);
  };

  const handleRemovePlank = (id: string) => {
    const updated = placedPlanks.filter((p) => p.id !== id);
    setPlacedPlanks(updated);
    if (selectedPlankId === id) setSelectedPlankId(null);
    physicsEngineRef.current?.updatePlacedPlanks(updated);
  };

  const handleUpdatePlankPosition = (id: string, x: number, y: number) => {
    const updated = placedPlanks.map((p) => (p.id === id ? { ...p, x, y } : p));
    setPlacedPlanks(updated);
    physicsEngineRef.current?.updatePlacedPlanks(updated);
  };

  const handleUpdatePlankAngle = (id: string, angle: number) => {
    const updated = placedPlanks.map((p) => (p.id === id ? { ...p, angle } : p));
    setPlacedPlanks(updated);
    physicsEngineRef.current?.updatePlacedPlanks(updated);
  };

  const handleRotatePlankStep = (id: string, deltaDegrees: number) => {
    const plank = placedPlanks.find((p) => p.id === id);
    if (!plank) return;
    const deltaRad = (deltaDegrees * Math.PI) / 180;
    handleUpdatePlankAngle(id, plank.angle + deltaRad);
  };

  const handleSetPlankAngle = (id: string, angleDegrees: number) => {
    const rad = (angleDegrees * Math.PI) / 180;
    handleUpdatePlankAngle(id, rad);
  };

  // Drop Simulation Handlers
  const handleStartDrop = () => {
    setSelectedPlankId(null);
    physicsEngineRef.current?.startDropSimulation();
  };

  const handleResetLevel = () => {
    physicsEngineRef.current?.initLevel(currentLevel, placedPlanks);
    setSelectedPlankId(null);
    setGameState('EDITING');
  };

  const handleReplay = () => {
    if (!physicsEngineRef.current || !currentLevel) return;
    physicsEngineRef.current.initLevel(currentLevel, placedPlanks);
    physicsEngineRef.current.startDropSimulation();
    setSelectedPlankId(null);
  };

  // Camera Zoom
  const handleZoomIn = () => setZoomLevel((z) => Math.min(2.0, z * 1.15));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(0.4, z * 0.85));
  const handleResetCamera = () => fitCameraToLevel(currentLevel);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#F3F4F9] font-sans">
      {/* Physics Engine Render Layer */}
      {physicsEngineRef.current && (
        <GameCanvas
          physicsEngine={physicsEngineRef.current}
          currentLevel={currentLevel}
          gameState={gameState}
          placedPlanks={placedPlanks}
          selectedPlankId={selectedPlankId}
          onSelectPlank={(id) => setSelectedPlankId(id)}
          onUpdatePlankPosition={handleUpdatePlankPosition}
          onUpdatePlankAngle={handleUpdatePlankAngle}
          zoomLevel={zoomLevel}
          panOffset={panOffset}
          onPanChange={setPanOffset}
        />
      )}

      {/* Game HUD Overlay */}
      <GameHUD
        currentLevel={currentLevel}
        levelsList={GAME_LEVELS}
        maxUnlockedLevel={maxUnlockedLevel}
        levelStars={levelStars}
        gameState={gameState}
        placedPlanks={placedPlanks}
        selectedPlankId={selectedPlankId}
        selectedWoodType={selectedWoodType}
        onSelectWoodType={setSelectedWoodType}
        onUpdatePlankWoodType={handleUpdatePlankWoodType}
        simulationStats={simulationStats}
        onSelectLevel={(id) => loadLevel(id)}
        onAddPlank={handleAddPlank}
        onRemovePlank={handleRemovePlank}
        onRotatePlankStep={handleRotatePlankStep}
        onSetPlankAngle={handleSetPlankAngle}
        onStartDrop={handleStartDrop}
        onResetLevel={handleResetLevel}
        onReplay={handleReplay}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetCamera={handleResetCamera}
      />
    </div>
  );
};
