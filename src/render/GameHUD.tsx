import React, { useState } from 'react';
import {
  Play,
  RotateCcw,
  Plus,
  Trash2,
  RotateCw,
  RotateCcw as RotateLeftIcon,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Volume2,
  VolumeX,
  HelpCircle,
  Trophy,
  AlertTriangle,
  ShieldCheck,
  ChevronRight,
  Info,
  Shield,
  Layers,
  Compass,
} from 'lucide-react';
import { GameState, PlacedPlank } from '../engine/physicsEngine';
import { LevelData, SimulationStats, WoodType, WOOD_MATERIALS } from '../entities/types';
import { soundManager } from '../engine/soundEffects';

interface GameHUDProps {
  currentLevel: LevelData;
  levelsList: LevelData[];
  maxUnlockedLevel: number;
  gameState: GameState;
  placedPlanks: PlacedPlank[];
  selectedPlankId: string | null;
  selectedWoodType: WoodType;
  onSelectWoodType: (woodType: WoodType) => void;
  onUpdatePlankWoodType?: (id: string, woodType: WoodType) => void;
  simulationStats: SimulationStats;
  onSelectLevel: (levelId: number) => void;
  onAddPlank: () => void;
  onRemovePlank: (id: string) => void;
  onRotatePlankStep: (id: string, deltaDegrees: number) => void;
  onSetPlankAngle: (id: string, angleDegrees: number) => void;
  onStartDrop: () => void;
  onResetLevel: () => void;
  onReplay?: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetCamera: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  currentLevel,
  levelsList,
  maxUnlockedLevel,
  gameState,
  placedPlanks,
  selectedPlankId,
  selectedWoodType,
  onSelectWoodType,
  onUpdatePlankWoodType,
  simulationStats,
  onSelectLevel,
  onAddPlank,
  onRemovePlank,
  onRotatePlankStep,
  onSetPlankAngle,
  onStartDrop,
  onResetLevel,
  onReplay,
  onZoomIn,
  onZoomOut,
  onResetCamera,
}) => {
  const [isSoundOn, setIsSoundOn] = useState(true);
  const [showHintModal, setShowHintModal] = useState(false);

  const toggleSound = () => {
    const next = !isSoundOn;
    setIsSoundOn(next);
    soundManager.setEnabled(next);
  };

  const selectedPlank = placedPlanks.find((p) => p.id === selectedPlankId);
  const remainingPlanks = currentLevel.availablePlanksCount - placedPlanks.length;

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-3 sm:p-4 select-none font-sans">
      {/* --- TOP HEADER BAR --- */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-2.5 bg-white border border-[#E1E2EC] rounded-3xl shadow-sm pointer-events-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#005AC1] rounded-full flex items-center justify-center text-white shadow-sm">
            <Shield className="w-5 h-5 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <select
                value={currentLevel.id}
                onChange={(e) => onSelectLevel(Number(e.target.value))}
                className="bg-transparent text-[16px] font-semibold text-[#1B1B1F] leading-tight outline-none cursor-pointer hover:text-[#005AC1] transition"
              >
                {levelsList.map((lvl) => (
                  <option key={lvl.id} value={lvl.id} className="bg-white text-[#1B1B1F]">
                    {lvl.title}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[12px] text-[#44474F] font-medium">Cat Defender Physics</p>
          </div>
        </div>

        {/* Right Top Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Hint Button */}
          <button
            onClick={() => setShowHintModal(true)}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[#F3F4F9] text-[#005AC1] hover:bg-[#E1E2EC] active:scale-95 transition min-w-[40px] min-h-[40px]"
            title="Level Hint"
          >
            <HelpCircle className="w-5 h-5" />
          </button>

          {/* Sound Mute/Unmute */}
          <button
            onClick={toggleSound}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[#F3F4F9] text-[#44474F] hover:bg-[#E1E2EC] active:scale-95 transition min-w-[40px] min-h-[40px]"
            title="Toggle Sound"
          >
            {isSoundOn ? <Volume2 className="w-5 h-5 text-[#005AC1]" /> : <VolumeX className="w-5 h-5 text-[#74777F]" />}
          </button>
        </div>
      </header>

      {/* --- TOP BADGES OVERLAY (Planks inventory & Gravity) --- */}
      <div className="flex justify-between items-start pt-2 px-2 pointer-events-none">
        <div className="bg-[#DBE2F9] px-4 py-2 rounded-full text-[#001D39] text-xs font-semibold border border-[#005AC1]/10 shadow-sm flex items-center gap-1.5 pointer-events-auto">
          <Layers className="w-3.5 h-3.5 text-[#005AC1]" />
          Planks: <span className="font-bold text-[#005AC1]">{placedPlanks.length} / {currentLevel.availablePlanksCount}</span>
        </div>
        <div className="bg-[#F4FBFA] px-4 py-2 rounded-full text-[#00201E] text-xs font-semibold border border-[#B1F1EB] shadow-sm flex items-center gap-1.5 pointer-events-auto">
          <Compass className="w-3.5 h-3.5 text-[#006A60]" />
          Gravity: 9.8m/s²
        </div>
      </div>

      {/* --- CAMERA CONTROLS (Right Floating Stack) --- */}
      <div className="absolute right-3 sm:right-5 top-24 flex flex-col gap-2 pointer-events-auto">
        <button
          onClick={onZoomIn}
          className="w-10 h-10 rounded-full bg-white border border-[#E1E2EC] text-[#005AC1] flex items-center justify-center hover:bg-[#F3F4F9] active:scale-95 transition shadow-sm min-w-[40px] min-h-[40px]"
          title="Zoom In"
        >
          <ZoomIn className="w-5 h-5" />
        </button>
        <button
          onClick={onZoomOut}
          className="w-10 h-10 rounded-full bg-white border border-[#E1E2EC] text-[#005AC1] flex items-center justify-center hover:bg-[#F3F4F9] active:scale-95 transition shadow-sm min-w-[40px] min-h-[40px]"
          title="Zoom Out"
        >
          <ZoomOut className="w-5 h-5" />
        </button>
        <button
          onClick={onResetCamera}
          className="w-10 h-10 rounded-full bg-white border border-[#E1E2EC] text-[#005AC1] flex items-center justify-center hover:bg-[#F3F4F9] active:scale-95 transition shadow-sm min-w-[40px] min-h-[40px]"
          title="Reset View"
        >
          <Maximize2 className="w-5 h-5" />
        </button>
      </div>

      {/* --- WOOD MATERIAL SELECTOR BAR --- */}
      {gameState === 'EDITING' && (
        <div className="self-center mb-2 pointer-events-auto bg-white/95 backdrop-blur-md border border-[#E1E2EC] rounded-full p-1.5 shadow-md flex items-center gap-1 sm:gap-2 max-w-full overflow-x-auto">
          <div className="px-2.5 text-[11px] font-bold uppercase tracking-wider text-[#74777F] hidden sm:block">
            Wood Type:
          </div>
          {(Object.keys(WOOD_MATERIALS) as WoodType[]).map((wType) => {
            const mat = WOOD_MATERIALS[wType];
            const activePlankType = selectedPlank ? (selectedPlank.woodType || 'OAK') : selectedWoodType;
            const isSelected = activePlankType === wType;
            return (
              <button
                key={wType}
                onClick={() => {
                  onSelectWoodType(wType);
                  if (selectedPlank && onUpdatePlankWoodType) {
                    onUpdatePlankWoodType(selectedPlank.id, wType);
                  }
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-[#005AC1] text-white shadow-sm scale-105'
                    : 'bg-[#F3F4F9] text-[#44474F] hover:bg-[#E1E2EC]'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full border border-black/20"
                  style={{ backgroundColor: mat.color }}
                />
                {mat.name} <span className="text-[10px] opacity-80">({mat.maxHealth} HP)</span>
              </button>
            );
          })}
        </div>
      )}

      {/* --- FLOATING SELECTED PLANK TOOLBAR --- */}
      {gameState === 'EDITING' && selectedPlank && (
        <div className="self-center mb-3 pointer-events-auto bg-white border-2 border-[#C4C6D0] rounded-3xl p-2.5 sm:p-3 shadow-xl flex items-center justify-center gap-3 sm:gap-4 max-w-full overflow-x-auto">
          <button
            onClick={() => onRotatePlankStep(selectedPlank.id, -15)}
            className="flex flex-col items-center gap-1 group active:scale-95 transition min-w-[50px]"
          >
            <div className="w-11 h-8 bg-[#DDE1FF] rounded-full flex items-center justify-center text-[#001453]">
              <RotateLeftIcon className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#44474F]">-15°</span>
          </button>

          <button
            onClick={() => onRotatePlankStep(selectedPlank.id, 15)}
            className="flex flex-col items-center gap-1 group active:scale-95 transition min-w-[50px]"
          >
            <div className="w-11 h-8 bg-[#DDE1FF] rounded-full flex items-center justify-center text-[#001453]">
              <RotateCw className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#44474F]">+15°</span>
          </button>

          <button
            onClick={() => onSetPlankAngle(selectedPlank.id, 0)}
            className="flex flex-col items-center gap-1 group active:scale-95 transition min-w-[50px]"
          >
            <div className="w-11 h-8 bg-[#F3F4F9] hover:bg-[#E1E2EC] rounded-full flex items-center justify-center text-[#005AC1] text-xs font-bold">
              0°
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#44474F]">FLAT</span>
          </button>

          <button
            onClick={() => onSetPlankAngle(selectedPlank.id, 45)}
            className="flex flex-col items-center gap-1 group active:scale-95 transition min-w-[50px]"
          >
            <div className="w-11 h-8 bg-[#F3F4F9] hover:bg-[#E1E2EC] rounded-full flex items-center justify-center text-[#005AC1] text-xs font-bold">
              45°
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#44474F]">DIAG</span>
          </button>

          <div className="w-px h-8 bg-[#E1E2EC] mx-0.5" />

          <button
            onClick={() => onRemovePlank(selectedPlank.id)}
            className="flex flex-col items-center gap-1 group active:scale-95 transition min-w-[50px]"
            title="Delete Plank"
          >
            <div className="w-11 h-8 bg-[#FFDAD6] hover:bg-[#FFB4AB] rounded-full flex items-center justify-center text-[#410002]">
              <Trash2 className="w-4 h-4 text-[#BA1A1A]" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#BA1A1A]">DELETE</span>
          </button>
        </div>
      )}

      {/* --- BOTTOM ACTION FOOTER --- */}
      <footer className="pointer-events-auto h-20 sm:h-22 px-4 sm:px-6 bg-white flex items-center justify-between gap-3 sm:gap-4 border border-[#E1E2EC] rounded-3xl shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        {gameState === 'EDITING' ? (
          <>
            {/* Reset / Add Plank outline button */}
            <button
              onClick={onAddPlank}
              disabled={remainingPlanks <= 0}
              className={`flex-1 h-12 sm:h-14 rounded-full border border-[#74777F] font-semibold text-sm sm:text-base flex items-center justify-center gap-2 active:bg-[#F3F4F9] transition ${
                remainingPlanks > 0
                  ? 'text-[#005AC1] border-[#005AC1] cursor-pointer'
                  : 'text-[#74777F] border-[#E1E2EC] opacity-50 cursor-not-allowed'
              }`}
            >
              <Plus className="w-5 h-5" /> Add Plank
            </button>

            {/* Drop Boulder primary button */}
            <button
              onClick={onStartDrop}
              disabled={placedPlanks.length === 0}
              className={`flex-[2] h-12 sm:h-14 bg-[#005AC1] rounded-full text-white font-bold text-base sm:text-lg flex items-center justify-center gap-2 sm:gap-3 shadow-md transition-all ${
                placedPlanks.length > 0
                  ? 'hover:bg-[#004395] active:scale-95 cursor-pointer shadow-[#005AC1]/20'
                  : 'bg-[#C4C6D0] cursor-not-allowed text-[#E1E2EC]'
              }`}
            >
              <Play className="w-5 h-5 fill-current" /> DROP BOULDER
            </button>
          </>
        ) : (
          /* Simulation active bar */
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3 text-xs sm:text-sm font-semibold text-[#1B1B1F]">
              <span className="flex items-center gap-1.5 text-[#005AC1] font-bold bg-[#DBE2F9] px-3 py-1.5 rounded-full border border-[#005AC1]/10">
                <ShieldCheck className="w-4 h-4" /> Simulating
              </span>
              <span className="hidden sm:inline text-[#44474F]">Impact Force: <b className="text-[#001D39] font-bold">{simulationStats.maxImpactForce} N</b></span>
            </div>

            <button
              onClick={onResetLevel}
              className="h-12 px-6 rounded-full border border-[#74777F] text-[#005AC1] font-semibold text-sm flex items-center justify-center gap-2 active:bg-[#F3F4F9] transition"
            >
              <RotateCcw className="w-4 h-4" /> Reset / Edit
            </button>
          </div>
        )}
      </footer>

      {/* --- LEVEL HINT MODAL --- */}
      {showHintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#001D39]/60 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white border-2 border-[#C4C6D0] rounded-[32px] p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-[#005AC1]">
              <div className="w-10 h-10 rounded-full bg-[#DBE2F9] flex items-center justify-center">
                <Info className="w-5 h-5 text-[#005AC1]" />
              </div>
              <h3 className="text-xl font-bold text-[#1B1B1F]">{currentLevel.title}</h3>
            </div>
            <p className="text-sm text-[#44474F] leading-relaxed">{currentLevel.description}</p>
            {currentLevel.hints && currentLevel.hints.length > 0 && (
              <div className="bg-[#F3F4F9] border border-[#E1E2EC] rounded-2xl p-4 space-y-2">
                {currentLevel.hints.map((h, i) => (
                  <p key={i} className="text-xs text-[#001D39] font-medium flex items-start gap-2">
                    <span className="text-[#005AC1] font-bold">•</span> {h}
                  </p>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowHintModal(false)}
              className="w-full h-12 bg-[#005AC1] hover:bg-[#004395] text-white font-bold rounded-full transition active:scale-95 min-h-[44px]"
            >
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* --- GAME OVER / WIN MODAL OVERLAYS --- */}
      {(gameState === 'WON' || gameState === 'FAILED') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#001D39]/65 backdrop-blur-md pointer-events-auto">
          <div className="bg-white border-2 border-[#C4C6D0] rounded-[32px] p-6 sm:p-8 max-w-md w-full shadow-2xl text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
            {gameState === 'WON' ? (
              <>
                <div className="w-20 h-20 mx-auto rounded-full bg-[#386A20]/10 border-2 border-[#386A20]/30 flex items-center justify-center text-[#2E6B12]">
                  <Trophy className="w-10 h-10" />
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-[#1B1B1F]">CAT PROTECTED!</h2>
                  <p className="text-sm text-[#44474F] mt-1">Your wooden shelter held strong against the falling impact.</p>
                </div>

                {/* Physics Stats Card */}
                <div className="bg-[#F3F4F9] border border-[#E1E2EC] rounded-2xl p-4 text-left space-y-2 text-xs sm:text-sm text-[#44474F]">
                  <div className="flex justify-between">
                    <span>Max Impact Energy:</span>
                    <b className="text-[#005AC1] font-bold">{simulationStats.maxImpactForce} N</b>
                  </div>
                  <div className="flex justify-between">
                    <span>Planks Intact:</span>
                    <b className="text-[#2E6B12] font-bold">{placedPlanks.length - simulationStats.planksBrokenCount} / {placedPlanks.length}</b>
                  </div>
                  <div className="flex justify-between">
                    <span>Planks Snapped:</span>
                    <b className="text-[#BA1A1A] font-bold">{simulationStats.planksBrokenCount}</b>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2">
                  <button
                    onClick={onReplay || onResetLevel}
                    className="h-12 border-2 border-[#005AC1] text-[#005AC1] hover:bg-[#005AC1]/10 font-bold rounded-full transition active:scale-95 flex items-center justify-center gap-1.5 text-xs sm:text-sm cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" /> Replay
                  </button>
                  <button
                    onClick={onResetLevel}
                    className="h-12 border border-[#74777F] text-[#44474F] hover:bg-[#F3F4F9] font-semibold rounded-full transition active:scale-95 flex items-center justify-center gap-1.5 text-xs sm:text-sm cursor-pointer"
                  >
                    Edit / Rebuild
                  </button>
                  {currentLevel.id < levelsList.length ? (
                    <button
                      onClick={() => onSelectLevel(currentLevel.id + 1)}
                      className="col-span-2 sm:col-span-1 h-12 flex items-center justify-center gap-1.5 bg-[#005AC1] hover:bg-[#004395] text-white font-bold rounded-full transition active:scale-95 shadow-md text-xs sm:text-sm cursor-pointer"
                    >
                      Next Level <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => onSelectLevel(1)}
                      className="col-span-2 sm:col-span-1 h-12 bg-[#005AC1] hover:bg-[#004395] text-white font-bold rounded-full transition active:scale-95 shadow-md text-xs sm:text-sm cursor-pointer"
                    >
                      Play Again
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="w-20 h-20 mx-auto rounded-full bg-[#BA1A1A]/10 border-2 border-[#BA1A1A]/30 flex items-center justify-center text-[#BA1A1A]">
                  <AlertTriangle className="w-10 h-10" />
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-[#1B1B1F]">STRUCTURE COLLAPSED!</h2>
                  <p className="text-sm text-[#44474F] mt-1">The falling force broke through your shelter and reached the cat.</p>
                </div>

                <div className="bg-[#F3F4F9] border border-[#E1E2EC] rounded-2xl p-4 text-left space-y-2 text-xs sm:text-sm text-[#44474F]">
                  <div className="flex justify-between">
                    <span>Collision Force Received:</span>
                    <b className="text-[#BA1A1A] font-bold">{simulationStats.maxImpactForce} N</b>
                  </div>
                  <div className="flex justify-between">
                    <span>Cat Max Tolerance:</span>
                    <b className="text-[#005AC1] font-bold">{currentLevel.cat.maxDamageForce} N</b>
                  </div>
                </div>

                <div className="bg-[#DBE2F9]/50 border border-[#005AC1]/20 rounded-2xl p-3 text-xs text-[#001D39] text-left">
                  <b>Physics Tip:</b> Lean planks at angles to form triangular roofs! Direct horizontal flat planks break easily under heavy vertical loads.
                </div>

                <button
                  onClick={onResetLevel}
                  className="w-full h-12 flex items-center justify-center gap-2 bg-[#005AC1] hover:bg-[#004395] text-white font-bold rounded-full transition active:scale-95 shadow-md"
                >
                  <RotateCcw className="w-5 h-5" /> Try Again & Rebuild
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
