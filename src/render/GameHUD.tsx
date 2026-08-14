import React, { useState } from 'react';
import {
  Play,
  RotateCcw,
  Trash2,
  RotateCw,
  RotateCcw as RotateLeftIcon,
  Volume2,
  VolumeX,
  HelpCircle,
  Trophy,
  AlertTriangle,
  ChevronRight,
  Coins,
  Check,
  Ruler,
  Weight,
  Home,
  Coins as CoinsIcon,
} from 'lucide-react';
import { GameState, PlacedPlank } from '../engine/physicsEngine';
import { LevelData, SimulationStats, WoodType, WOOD_MATERIALS } from '../entities/types';
import { soundManager } from '../engine/soundEffects';
import { plankPrice } from '../entities/economy';

const WOOD_ORDER: WoodType[] = ['PINE', 'OAK', 'IRONWOOD'];
const WOOD_SPRITES: Record<WoodType, string> = {
  PINE: './assets/plank_pine.png',
  OAK: './assets/plank_oak.png',
  IRONWOOD: './assets/plank_ironwood.png',
};

interface GameHUDProps {
  currentLevel: LevelData;
  totalLevels: number;
  bestLevel: number;
  gameState: GameState;
  points: number;
  placedPlanks: PlacedPlank[];
  selectedPlankId: string | null;
  simulationStats: SimulationStats;
  lastRunScore: number;
  onSpawnPlank: (woodType: WoodType) => void;
  onCommitPlank: () => void;
  onRemovePlank: (id: string) => void;
  onRotatePlankStep: (id: string, deltaDegrees: number) => void;
  onSetPlankAngle: (id: string, angleDegrees: number) => void;
  onStartDrop: () => void;
  onResetLevel: () => void;
  onReplay: () => void;
  onNextLevel: () => void;
  onRestartRun: () => void;
  onOpenMenu: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  currentLevel,
  totalLevels,
  gameState,
  points,
  placedPlanks,
  selectedPlankId,
  simulationStats,
  lastRunScore,
  onSpawnPlank,
  onCommitPlank,
  onRemovePlank,
  onRotatePlankStep,
  onSetPlankAngle,
  onStartDrop,
  onResetLevel,
  onReplay,
  onNextLevel,
  onRestartRun,
  onOpenMenu,
}) => {
  const [isSoundOn, setIsSoundOn] = useState(true);
  const [showHintModal, setShowHintModal] = useState(false);

  const playClick = () => soundManager.play('ui_click');

  const toggleSound = () => {
    const next = !isSoundOn;
    setIsSoundOn(next);
    soundManager.setEnabled(next);
  };

  const selectedPlank = placedPlanks.find((p) => p.id === selectedPlankId);
  const isEditing = gameState === 'EDITING';
  const isFinished = gameState === 'WON' || gameState === 'FAILED';

  // Before the drop the barometer shows the level's authored height; during the
  // fall it tracks the leading boulder live.
  const altitude = isEditing ? currentLevel.dropHeightMeters : simulationStats.ballAltitudeMeters;
  const altitudeRatio = Math.max(0, Math.min(1, altitude / currentLevel.dropHeightMeters));

  // Heaviest boulder in the level, shown as a readable weight. Matter.js mass is
  // density x area in engine units, scaled here purely for presentation.
  // A level can be entered with too little coin to buy even the cheapest plank.
  // START needs at least one plank, so without an escape hatch that state is a
  // dead end: nothing to place, nothing to press, no way to lose and retry.
  const cheapestPlank = Math.min(...WOOD_ORDER.map(plankPrice));
  const isBankrupt = isEditing && placedPlanks.length === 0 && points < cheapestPlank;

  const boulderMassKg = Math.round(
    Math.max(...currentLevel.balls.map((b) => b.density * Math.PI * b.radius * b.radius)) * 10
  );

  return (
    <div className="absolute inset-0 pointer-events-none select-none font-sans text-white">
      {/* --- TOP BAR --- */}
      <header className="absolute top-0 left-0 right-0 flex items-start justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="pointer-events-auto bg-black/35 backdrop-blur-md rounded-2xl px-3 py-1.5 shadow-lg min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-white/60 leading-none">
              Level {currentLevel.id}
              <span className="text-white/35"> / {totalLevels}</span>
            </div>
            <div className="text-[13px] font-bold leading-tight mt-0.5 truncate">{currentLevel.title}</div>
          </div>

          <div className="pointer-events-auto flex items-center gap-1 bg-[#FFB300] text-[#3A2600] rounded-2xl px-2.5 py-2 shadow-lg font-bold shrink-0">
            <Coins className="w-3.5 h-3.5" />
            <span className="text-[13px] tabular-nums">{points}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => {
              playClick();
              onOpenMenu();
            }}
            className="pointer-events-auto w-10 h-10 flex items-center justify-center rounded-full bg-black/35 backdrop-blur-md active:scale-95 transition shadow-lg"
            aria-label="Main menu"
          >
            <Home className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              playClick();
              setShowHintModal(true);
            }}
            className="pointer-events-auto w-10 h-10 flex items-center justify-center rounded-full bg-black/35 backdrop-blur-md active:scale-95 transition shadow-lg"
            aria-label="Level hint"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          <button
            onClick={toggleSound}
            className="pointer-events-auto w-10 h-10 flex items-center justify-center rounded-full bg-black/35 backdrop-blur-md active:scale-95 transition shadow-lg"
            aria-label={isSoundOn ? 'Mute sound' : 'Unmute sound'}
          >
            {isSoundOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5 text-white/50" />}
          </button>
        </div>
      </header>

      {/* --- ALTITUDE BAROMETER (left rail) --- */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center gap-2">
        <div className="bg-black/35 backdrop-blur-md rounded-2xl px-2.5 py-3 flex flex-col items-center gap-2 shadow-lg">
          <div className="text-[15px] font-bold tabular-nums leading-none">
            {altitude.toFixed(altitude < 10 ? 1 : 0)}
            <span className="text-[10px] font-semibold text-white/60 ml-0.5">m</span>
          </div>

          {/* Vertical gauge: filled portion is how far the boulder still has to fall */}
          <div className="relative w-2 h-32 rounded-full bg-white/15 overflow-hidden">
            <div
              className="absolute left-0 right-0 bottom-0 bg-gradient-to-t from-[#FFB300] to-[#FF7043] rounded-full transition-[height] duration-100"
              style={{ height: `${altitudeRatio * 100}%` }}
            />
          </div>

          <div className="text-[9px] font-bold tracking-wider text-white/45 leading-none">0m</div>
        </div>
      </div>

      {/* --- INVENTORY RAIL (right) --- */}
      {isEditing && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-auto flex flex-col gap-2">
          {WOOD_ORDER.map((woodType) => {
            const mat = WOOD_MATERIALS[woodType];
            const price = plankPrice(woodType);
            const affordable = Math.floor(points / price);
            const disabled = affordable < 1;

            return (
              <button
                key={woodType}
                onClick={() => !disabled && onSpawnPlank(woodType)}
                disabled={disabled}
                className={`relative w-[58px] rounded-2xl px-1.5 py-2 flex flex-col items-center gap-1.5 shadow-lg backdrop-blur-md transition active:scale-95 ${
                  disabled ? 'bg-black/25 opacity-40' : 'bg-black/40 hover:bg-black/50'
                }`}
                aria-label={`${mat.name} plank`}
              >
                <img
                  src={WOOD_SPRITES[woodType]}
                  alt=""
                  className="w-full h-4 object-cover rounded-[3px]"
                  style={{ backgroundColor: mat.color }}
                />
                <div className="flex items-center gap-0.5 text-[10px] font-bold tabular-nums text-[#FFD54F]">
                  <Coins className="w-2.5 h-2.5" />
                  {price}
                </div>
                <div className="text-[11px] font-bold tabular-nums leading-none text-white/70">
                  <span className="text-white/40 text-[9px]">×</span>
                  {affordable}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* --- BOULDER BRIEFING BUBBLE ---
           Shown while building so the player can plan against real numbers;
           it disappears the moment the level starts. */}
      {isEditing && !selectedPlank && (
        <div className="absolute bottom-[92px] left-1/2 -translate-x-1/2 pointer-events-none bg-black/45 backdrop-blur-md rounded-2xl px-3.5 py-2 shadow-lg flex items-center gap-3.5">
          <div className="flex items-center gap-1.5">
            <Ruler className="w-3.5 h-3.5 text-[#FFD54F]" />
            <span className="text-[13px] font-bold tabular-nums">
              {currentLevel.dropHeightMeters}
              <span className="text-[10px] text-white/55 ml-0.5">m</span>
            </span>
          </div>
          <div className="w-px h-4 bg-white/20" />
          <div className="flex items-center gap-1.5">
            <Weight className="w-3.5 h-3.5 text-[#FFD54F]" />
            <span className="text-[13px] font-bold tabular-nums">
              {boulderMassKg}
              <span className="text-[10px] text-white/55 ml-0.5">kg</span>
            </span>
          </div>
          {currentLevel.balls.length > 1 && (
            <>
              <div className="w-px h-4 bg-white/20" />
              <span className="text-[13px] font-bold tabular-nums">×{currentLevel.balls.length}</span>
            </>
          )}
        </div>
      )}

      {/* --- SELECTED PLANK TOOLBAR --- */}
      {isEditing && selectedPlank && (
        <div className="absolute bottom-[92px] left-1/2 -translate-x-1/2 pointer-events-auto bg-black/55 backdrop-blur-md rounded-full p-1.5 flex items-center gap-1 shadow-xl">
          <button
            onClick={() => {
              playClick();
              onRotatePlankStep(selectedPlank.id, -15);
            }}
            className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center active:scale-95 transition"
            aria-label="Rotate left"
          >
            <RotateLeftIcon className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              playClick();
              onRotatePlankStep(selectedPlank.id, 15);
            }}
            className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center active:scale-95 transition"
            aria-label="Rotate right"
          >
            <RotateCw className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              playClick();
              onSetPlankAngle(selectedPlank.id, 0);
            }}
            className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-[12px] font-bold active:scale-95 transition"
            aria-label="Set flat"
          >
            0°
          </button>
          <button
            onClick={() => {
              playClick();
              onSetPlankAngle(selectedPlank.id, 45);
            }}
            className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-[12px] font-bold active:scale-95 transition"
            aria-label="Set diagonal"
          >
            45°
          </button>

          <div className="w-px h-7 bg-white/20 mx-0.5" />

          <button
            onClick={() => {
              playClick();
              onRemovePlank(selectedPlank.id);
            }}
            className="w-11 h-11 rounded-full bg-[#BA1A1A]/80 hover:bg-[#BA1A1A] flex items-center justify-center active:scale-95 transition"
            aria-label="Delete plank"
          >
            <Trash2 className="w-5 h-5" />
          </button>

          {/* Confirm placement: the plank is handed over to gravity */}
          <button
            onClick={onCommitPlank}
            className="h-11 px-4 rounded-full bg-[#2E7D32] hover:bg-[#256628] flex items-center justify-center gap-1.5 font-extrabold text-sm active:scale-95 transition"
            aria-label="Done placing"
          >
            <Check className="w-5 h-5" /> DONE
          </button>
        </div>
      )}

      {/* --- BOTTOM ACTION --- */}
      <div className="absolute bottom-0 left-0 right-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {isEditing ? (
          <button
            onClick={() => {
              playClick();
              onStartDrop();
            }}
            disabled={placedPlanks.length === 0}
            className={`pointer-events-auto w-full h-14 rounded-2xl font-extrabold text-lg tracking-wide flex items-center justify-center gap-2.5 shadow-xl transition ${
              placedPlanks.length > 0
                ? 'bg-[#005AC1] hover:bg-[#004395] active:scale-[0.98] text-white'
                : 'bg-black/30 backdrop-blur-md text-white/40 cursor-not-allowed'
            }`}
          >
            <Play className="w-5 h-5 fill-current" /> START
          </button>
        ) : (
          !isFinished && (
            <button
              onClick={() => {
                playClick();
                onResetLevel();
              }}
              className="pointer-events-auto w-full h-14 rounded-2xl bg-black/40 backdrop-blur-md font-bold flex items-center justify-center gap-2 shadow-xl active:scale-[0.98] transition"
            >
              <RotateCcw className="w-5 h-5" /> Rebuild
            </button>
          )
        )}
      </div>

      {/* --- OUT OF COINS RESCUE --- */}
      {isBankrupt && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-6 bg-[#00243D]/70 backdrop-blur-sm pointer-events-auto">
          <div className="bg-[#0E3556] border border-white/15 rounded-3xl p-6 max-w-[330px] w-full shadow-2xl text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-[#FFB300]/20 border-2 border-[#FFB300]/40 flex items-center justify-center text-[#FFB300]">
              <CoinsIcon className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold">OUT OF COINS</h2>
              <p className="text-sm text-white/60 mt-1">
                Not enough left to buy a plank. Start a fresh run to try again.
              </p>
            </div>
            <button
              onClick={() => {
                playClick();
                onRestartRun();
              }}
              className="w-full h-12 rounded-2xl bg-[#005AC1] hover:bg-[#004395] font-bold transition active:scale-[0.98] shadow-lg flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> New run
            </button>
          </div>
        </div>
      )}

      {/* --- HINT MODAL --- */}
      {showHintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-[#00243D]/70 backdrop-blur-sm pointer-events-auto">
          <div className="bg-[#0E3556] border border-white/15 rounded-3xl p-5 max-w-[330px] w-full shadow-2xl space-y-3">
            <h3 className="text-xl font-bold">{currentLevel.title}</h3>
            <p className="text-sm text-white/70 leading-relaxed">{currentLevel.description}</p>
            {currentLevel.hints?.map((h, i) => (
              <p key={i} className="text-sm text-[#FFD54F] bg-white/5 rounded-2xl p-3 leading-relaxed">
                {h}
              </p>
            ))}
            <button
              onClick={() => {
                playClick();
                setShowHintModal(false);
              }}
              className="w-full h-12 bg-[#005AC1] hover:bg-[#004395] font-bold rounded-2xl transition active:scale-[0.98]"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* --- WIN / LOSE --- */}
      {isFinished && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-[#00243D]/75 backdrop-blur-md pointer-events-auto">
          <div className="bg-[#0E3556] border border-white/15 rounded-3xl p-6 max-w-[330px] w-full shadow-2xl text-center space-y-4">
            {gameState === 'WON' ? (
              <>
                <div className="w-16 h-16 mx-auto rounded-full bg-[#FFB300]/20 border-2 border-[#FFB300]/40 flex items-center justify-center text-[#FFB300]">
                  <Trophy className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold">CAT PROTECTED</h2>
                  <p className="text-sm text-white/60 mt-1">Your shelter held.</p>
                </div>

                <div className="flex items-center justify-center gap-1.5 text-[#FFD54F] text-2xl font-extrabold tabular-nums">
                  <Coins className="w-6 h-6" />+{lastRunScore}
                </div>

                <div className="bg-white/5 rounded-2xl p-3 space-y-1.5 text-sm text-white/70">
                  <div className="flex justify-between">
                    <span>Peak impact</span>
                    <b className="text-white tabular-nums">{simulationStats.maxImpactForce} N</b>
                  </div>
                  <div className="flex justify-between">
                    <span>Planks used</span>
                    <b className="text-white tabular-nums">{placedPlanks.length}</b>
                  </div>
                  <div className="flex justify-between">
                    <span>Planks snapped</span>
                    <b className="text-white tabular-nums">{simulationStats.planksBrokenCount}</b>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => {
                      playClick();
                      onReplay();
                    }}
                    className="h-12 rounded-2xl border border-white/25 hover:bg-white/10 font-bold text-sm transition active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw className="w-4 h-4" /> Replay
                  </button>
                  <button
                    onClick={() => {
                      playClick();
                      onNextLevel();
                    }}
                    className="h-12 rounded-2xl bg-[#005AC1] hover:bg-[#004395] font-bold text-sm transition active:scale-95 shadow-lg flex items-center justify-center gap-1"
                  >
                    {currentLevel.id < totalLevels ? 'Next' : 'Restart'} <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 mx-auto rounded-full bg-[#BA1A1A]/20 border-2 border-[#BA1A1A]/40 flex items-center justify-center text-[#FF6B6B]">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold">SHELTER FAILED</h2>
                  <p className="text-sm text-white/60 mt-1">
                    {simulationStats.catHurtCause === 'ball'
                      ? 'The boulder got through to the cat.'
                      : simulationStats.catHurtCause === 'fragment'
                      ? 'Flying debris struck the cat.'
                      : 'Your own shelter came down on the cat.'}{' '}
                    The run restarts from level 1.
                  </p>
                </div>

                <div className="bg-white/5 rounded-2xl p-3 space-y-1.5 text-sm text-white/70">
                  <div className="flex justify-between">
                    <span>Level reached</span>
                    <b className="text-white tabular-nums">{currentLevel.id}</b>
                  </div>
                  <div className="flex justify-between">
                    <span>Planks used</span>
                    <b className="text-white tabular-nums">{placedPlanks.length}</b>
                  </div>
                </div>

                <button
                  onClick={() => {
                    playClick();
                    onRestartRun();
                  }}
                  className="w-full h-12 rounded-2xl bg-[#005AC1] hover:bg-[#004395] font-bold text-sm transition active:scale-[0.98] shadow-lg flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" /> Back to level 1
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
