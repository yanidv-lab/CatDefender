import React from 'react';
import { Play, Trophy, Settings, ArrowLeft, Volume2, VolumeX, Vibrate, RotateCcw, Coins } from 'lucide-react';

export type MenuScreen = 'MENU' | 'SCORES' | 'OPTIONS';

export interface ProgressStats {
  bestLevel: number;
  bestPoints: number;
  levelsCleared: number;
  totalLevels: number;
}

interface MainMenuProps {
  screen: MenuScreen;
  stats: ProgressStats;
  hasRunInProgress: boolean;
  soundOn: boolean;
  hapticsOn: boolean;
  onNavigate: (screen: MenuScreen) => void;
  onNewGame: () => void;
  onContinue: () => void;
  onToggleSound: () => void;
  onToggleHaptics: () => void;
  onResetProgress: () => void;
}

const Panel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-black/35 backdrop-blur-md rounded-3xl p-5 shadow-xl w-full">{children}</div>
);

export const MainMenu: React.FC<MainMenuProps> = ({
  screen,
  stats,
  hasRunInProgress,
  soundOn,
  hapticsOn,
  onNavigate,
  onNewGame,
  onContinue,
  onToggleSound,
  onToggleHaptics,
  onResetProgress,
}) => {
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-5 px-6 text-white select-none">
      {/* Title lockup, sitting over the live game sky behind it */}
      {screen === 'MENU' && (
        <>
          <div className="flex flex-col items-center gap-1 mb-1">
            <img
              src="./assets/cat_idle.png"
              alt=""
              className="w-28 h-28 object-contain drop-shadow-2xl"
            />
            <h1 className="text-[40px] font-extrabold tracking-tight leading-none drop-shadow-lg">
              Cat Defender
            </h1>
            <p className="text-sm text-white/70 font-medium">Build the shelter. Save the cat.</p>
          </div>

          <div className="w-full max-w-[300px] flex flex-col gap-2.5">
            {hasRunInProgress && (
              <button
                onClick={onContinue}
                className="w-full h-14 rounded-2xl bg-[#005AC1] hover:bg-[#004395] font-extrabold text-lg flex items-center justify-center gap-2.5 shadow-xl active:scale-[0.98] transition"
              >
                <Play className="w-5 h-5 fill-current" /> CONTINUE
              </button>
            )}
            <button
              onClick={onNewGame}
              className={`w-full h-14 rounded-2xl font-extrabold text-lg flex items-center justify-center gap-2.5 shadow-xl active:scale-[0.98] transition ${
                hasRunInProgress
                  ? 'bg-black/40 backdrop-blur-md hover:bg-black/50'
                  : 'bg-[#005AC1] hover:bg-[#004395]'
              }`}
            >
              <Play className="w-5 h-5 fill-current" /> NEW GAME
            </button>
            <button
              onClick={() => onNavigate('SCORES')}
              className="w-full h-13 py-3.5 rounded-2xl bg-black/40 backdrop-blur-md hover:bg-black/50 font-bold flex items-center justify-center gap-2.5 shadow-lg active:scale-[0.98] transition"
            >
              <Trophy className="w-5 h-5" /> SCORE
            </button>
            <button
              onClick={() => onNavigate('OPTIONS')}
              className="w-full h-13 py-3.5 rounded-2xl bg-black/40 backdrop-blur-md hover:bg-black/50 font-bold flex items-center justify-center gap-2.5 shadow-lg active:scale-[0.98] transition"
            >
              <Settings className="w-5 h-5" /> OPTIONS
            </button>
          </div>
        </>
      )}

      {screen === 'SCORES' && (
        <div className="w-full max-w-[320px] flex flex-col gap-4">
          <h2 className="text-2xl font-extrabold text-center">Score</h2>
          <Panel>
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-white/70">Best level reached</span>
                <b className="text-lg tabular-nums">
                  {stats.bestLevel}
                  <span className="text-white/40 text-sm"> / {stats.totalLevels}</span>
                </b>
              </div>
              <div className="h-px bg-white/10" />
              <div className="flex items-center justify-between">
                <span className="text-white/70">Levels cleared</span>
                <b className="text-lg tabular-nums">{stats.levelsCleared}</b>
              </div>
              <div className="h-px bg-white/10" />
              <div className="flex items-center justify-between">
                <span className="text-white/70">Best coin total</span>
                <b className="text-lg tabular-nums flex items-center gap-1.5 text-[#FFD54F]">
                  <Coins className="w-4 h-4" />
                  {stats.bestPoints}
                </b>
              </div>
            </div>
          </Panel>
          <p className="text-xs text-white/50 text-center leading-relaxed">
            Clear levels using fewer planks to bank more coins — the efficiency bonus shrinks with
            every plank you place.
          </p>
          <button
            onClick={() => onNavigate('MENU')}
            className="w-full h-12 rounded-2xl bg-black/40 backdrop-blur-md hover:bg-black/50 font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </div>
      )}

      {screen === 'OPTIONS' && (
        <div className="w-full max-w-[320px] flex flex-col gap-4">
          <h2 className="text-2xl font-extrabold text-center">Options</h2>
          <Panel>
            <div className="flex flex-col gap-2">
              <button
                onClick={onToggleSound}
                className="flex items-center justify-between py-2.5 active:scale-[0.99] transition"
              >
                <span className="flex items-center gap-2.5 font-semibold">
                  {soundOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5 text-white/50" />}
                  Sound
                </span>
                <span
                  className={`w-12 h-7 rounded-full flex items-center px-0.5 transition ${
                    soundOn ? 'bg-[#2E7D32] justify-end' : 'bg-white/20 justify-start'
                  }`}
                >
                  <span className="w-6 h-6 rounded-full bg-white shadow" />
                </span>
              </button>

              <div className="h-px bg-white/10" />

              <button
                onClick={onToggleHaptics}
                className="flex items-center justify-between py-2.5 active:scale-[0.99] transition"
              >
                <span className="flex items-center gap-2.5 font-semibold">
                  <Vibrate className={`w-5 h-5 ${hapticsOn ? '' : 'text-white/50'}`} />
                  Vibration
                </span>
                <span
                  className={`w-12 h-7 rounded-full flex items-center px-0.5 transition ${
                    hapticsOn ? 'bg-[#2E7D32] justify-end' : 'bg-white/20 justify-start'
                  }`}
                >
                  <span className="w-6 h-6 rounded-full bg-white shadow" />
                </span>
              </button>
            </div>
          </Panel>

          <button
            onClick={onResetProgress}
            className="w-full h-12 rounded-2xl border border-[#FF6B6B]/50 text-[#FF6B6B] hover:bg-[#BA1A1A]/20 font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition"
          >
            <RotateCcw className="w-4 h-4" /> Reset all progress
          </button>

          <button
            onClick={() => onNavigate('MENU')}
            className="w-full h-12 rounded-2xl bg-black/40 backdrop-blur-md hover:bg-black/50 font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </div>
      )}
    </div>
  );
};
