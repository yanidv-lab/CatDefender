// Thin wrapper around the Vibration API for Android WebView haptic feedback.
// Silently no-ops on platforms without navigator.vibrate (e.g. iOS Safari).

export type HapticEvent = 'wood_impact' | 'wood_snap' | 'cat_hurt' | 'cat_win' | 'ball_drop' | 'ui_click';

const PATTERNS: Record<HapticEvent, number | number[]> = {
  ui_click: 8,
  ball_drop: 15,
  wood_impact: 20,
  wood_snap: [0, 25, 30, 40],
  cat_hurt: [0, 60, 40, 60],
  cat_win: [0, 20, 60, 20, 60, 40],
};

export function triggerHaptic(event: HapticEvent) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(PATTERNS[event]);
  } catch {
    // Vibration API can throw in some embedded WebViews without the permission granted; ignore.
  }
}
