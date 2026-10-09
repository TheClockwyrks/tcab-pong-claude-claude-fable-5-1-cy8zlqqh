// Carom — the game.
//
// This module declares the state the game is written against, the debug and
// automation surface a caller drives it through, and the `Game` the engine
// binds. The simulation lives in `update.ts` and `physics.ts`, the drawing in
// `render.ts`, the menus in `menu.ts`, and the surface in `debug.ts`.

import type {
  Game,
  InitApi,
  RenderApi,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { ACTIONS, BINDINGS, CUES } from "./constants";
import { createDebugApi } from "./debug";
import type { CaromDebugApi } from "./debug";
import { registerDiagnostics } from "./diagnostics";
import { renderGame } from "./render";
import { titleState } from "./state";
import { updateGame } from "./update";

export type { CaromDebugApi, MenuItemRect, Snapshot } from "./debug";

// ---- The state (specs/state.md) -------------------------------------------

export type Screen =
  "title" | "howto" | "countdown" | "playing" | "paused" | "matchover";

export type Mode = "solo" | "versus";

export type Side = "left" | "right";

export interface PaddleState {
  readonly cy: number;
  readonly vy: number;
  readonly driven: boolean;
  readonly drivenVy: number;
}

export interface AiState {
  readonly tracking: boolean;
  readonly movement: boolean;
}

export interface TrailSample {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

export interface BallState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
  readonly held: boolean;
  readonly holdTimer: number;
  readonly serveSign: 1 | -1;
  readonly trail: readonly TrailSample[];
}

export interface ObstacleState {
  readonly index: number;
  readonly cx: number;
  readonly cy: number;
}

/**
 * A pointer press in flight over a menu: which pointer landed and on which item.
 * It is transient input bookkeeping rather than game state, held here only
 * because a press and its release arrive on different frames and nothing but
 * the state carries a value from one frame to the next. It never reaches a
 * snapshot, and every return to the title clears it.
 */
export interface MenuPress {
  readonly pointerId: number;
  readonly index: number;
}

export interface CaromState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly resumeScreen: "countdown" | "playing";

  readonly score: { readonly p1: number; readonly p2: number };
  readonly winner: Side | null;

  readonly paddles: { readonly left: PaddleState; readonly right: PaddleState };
  readonly ai: AiState;

  readonly receiver: Side;
  readonly ball: BallState | null;
  readonly obstacles: readonly ObstacleState[];

  readonly simTime: number;
  readonly muted: boolean;

  readonly menuPress: MenuPress | null;
}

// ---- Presentation ----------------------------------------------------------

/**
 * The field background, a CSS color string. `src/main.ts` hands it to the engine
 * as the color the canvas is cleared to each frame, so the letterbox bars around
 * the field match the field itself.
 */
export const BACKGROUND = "#0b0e1a";

// ---- The game ----------------------------------------------------------------

/** The cue each event sounds: four short blips, told apart by ear. */
const CUE_SPECS = {
  [CUES.paddleHit]: {
    wave: "square",
    freq: 520,
    freqTo: 660,
    durationMs: 70,
    gain: 0.16,
  },
  [CUES.wallBounce]: {
    wave: "triangle",
    freq: 300,
    freqTo: 240,
    durationMs: 60,
    gain: 0.14,
  },
  [CUES.obstacleBounce]: {
    wave: "sawtooth",
    freq: 180,
    freqTo: 140,
    durationMs: 90,
    gain: 0.12,
  },
  [CUES.score]: {
    wave: "sine",
    freq: 880,
    freqTo: 440,
    durationMs: 260,
    gain: 0.18,
  },
} as const;

export const game: Game<CaromState, CaromDebugApi> = {
  initialize(api: InitApi<CaromState>): [CaromState, CaromDebugApi] {
    for (const name of ACTIONS) {
      api.input.register(name, { keys: [...BINDINGS[name]] });
    }
    for (const [cue, spec] of Object.entries(CUE_SPECS)) {
      api.audio.define(cue, spec);
    }
    registerDiagnostics(api.diagnostics);
    return [titleState(false), createDebugApi()];
  },

  update(
    state: DeepReadonly<CaromState>,
    api: UpdateApi,
    dt: number,
  ): CaromState {
    return updateGame(state, api, dt);
  },

  render(state: DeepReadonly<CaromState>, api: RenderApi): void {
    renderGame(state, api.ctx);
  },
};
