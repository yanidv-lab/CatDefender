import 'matter-js';

declare module 'matter-js' {
  interface Body {
    customData?: {
      plankId?: string;
      catId?: string;
      ballId?: string;
      dropDelayMs?: number;
      maxHealth?: number;
      health?: number;
      isCracked?: boolean;
      isBroken?: boolean;
      isFragment?: boolean;
      width?: number;
      height?: number;
    };
  }
}
