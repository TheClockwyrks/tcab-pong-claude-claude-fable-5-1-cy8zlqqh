// Carom — the debug and automation surface (specs/instrumentation.md).
//
// Every operation takes the current state first. A pose returns the next state
// built from it; a reading returns what it read. A pose with nothing to act on
// throws rather than refusing quietly.

import type { DeepReadonly } from "ts-essentials";
import { CAROM_DEBUG_VERSION } from "./constants";
import type {
  BallState,
  CaromState,
  Mode,
  ObstacleState,
  PaddleState,
  Screen,
  Side,
  TrailSample,
} from "./game";
import { menuItemRect as menuRect } from "./menu";
import type { MenuItemRect } from "./menu";
import {
  drawServeSign,
  obstacleAt,
  parkedBall,
  thaw,
  titleState,
} from "./state";

export type { MenuItemRect } from "./menu";

type S = DeepReadonly<CaromState>;

/** What `snapshot` returns: the whole declared state, as plain values. */
export interface Snapshot {
  readonly version: number;
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly resumeScreen: "countdown" | "playing";
  readonly score: { readonly p1: number; readonly p2: number };
  readonly winner: Side | null;
  readonly muted: boolean;
  readonly paddles: { readonly left: PaddleState; readonly right: PaddleState };
  readonly ai: { readonly tracking: boolean; readonly movement: boolean };
  readonly receiver: Side;
  readonly ball: (BallState & { readonly speed: number }) | null;
  readonly obstacles: readonly ObstacleState[];
  readonly simTime: number;
}

export interface CaromDebugApi {
  readonly version: number;

  clearWorld(state: S): CaromState;
  spawnBall(state: S): CaromState;
  spawnObstacle(state: S, index: number): CaromState;
  reset(state: S): CaromState;
  reconcile(state: S): CaromState;

  setScreen(state: S, screen: Screen): CaromState;
  setMode(state: S, mode: Mode): CaromState;
  setMenuIndex(state: S, index: number): CaromState;
  setTitleIndex(state: S, index: number): CaromState;
  setResumeScreen(state: S, screen: "countdown" | "playing"): CaromState;

  setScore(state: S, p1: number, p2: number): CaromState;
  setWinner(state: S, side: Side | null): CaromState;
  setReceiver(state: S, side: Side): CaromState;

  setPaddleCy(state: S, side: Side, cy: number): CaromState;
  setPaddleVy(state: S, side: Side, vy: number): CaromState;
  setPaddleDriven(state: S, side: Side, driven: boolean): CaromState;

  setBallPosition(state: S, x: number, y: number): CaromState;
  setBallVelocity(state: S, vx: number, vy: number): CaromState;
  setBallSpin(state: S, spin: number): CaromState;
  setBallHeld(state: S, held: boolean): CaromState;
  setBallHoldTimer(state: S, seconds: number): CaromState;
  setBallServeSign(state: S, sign: 1 | -1): CaromState;
  drawBallServeSign(state: S): CaromState;

  setAiTracking(state: S, enabled: boolean): CaromState;
  setAiMovement(state: S, enabled: boolean): CaromState;

  setMuted(state: S, muted: boolean): CaromState;

  snapshot(state: S): Snapshot;
  menuItemRect(state: S, index: number): MenuItemRect | null;
}

const SCREENS: readonly Screen[] = [
  "title",
  "howto",
  "countdown",
  "playing",
  "paused",
  "matchover",
];

function assertOneOf<T>(value: T, allowed: readonly T[], what: string): T {
  if (!allowed.includes(value)) {
    throw new RangeError(
      `Carom: ${what} must be one of ${allowed.join(", ")}, got ${String(value)}`,
    );
  }
  return value;
}

function assertNumber(value: number, what: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new RangeError(
      `Carom: ${what} must be a number, got ${String(value)}`,
    );
  }
  return value;
}

function assertBoolean(value: boolean, what: string): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(
      `Carom: ${what} must be a boolean, got ${String(value)}`,
    );
  }
  return value;
}

const assertSide = (side: Side): Side =>
  assertOneOf(side, ["left", "right"], "side");

/** The ball, or a loud failure while the field carries none. */
function requireBall(state: S): BallState {
  if (state.ball === null) {
    throw new Error("Carom: no ball is on the field to pose");
  }
  return state.ball;
}

function withBall(state: S, patch: Partial<BallState>): CaromState {
  return { ...thaw(state), ball: { ...requireBall(state), ...patch } };
}

function withPaddle(
  state: S,
  side: Side,
  patch: Partial<PaddleState>,
): CaromState {
  assertSide(side);
  return {
    ...thaw(state),
    paddles: {
      ...state.paddles,
      [side]: { ...state.paddles[side], ...patch },
    },
  };
}

export function createDebugApi(): CaromDebugApi {
  return {
    version: CAROM_DEBUG_VERSION,

    clearWorld: (s) => ({ ...thaw(s), ball: null, obstacles: [] }),
    spawnBall: (s) => ({ ...thaw(s), ball: parkedBall() }),
    spawnObstacle: (s, index) => {
      const obstacle = obstacleAt(assertNumber(index, "obstacle index"));
      const others = s.obstacles.filter((o) => o.index !== index);
      const obstacles = [...others, obstacle].sort((a, b) => a.index - b.index);
      return { ...thaw(s), obstacles };
    },
    reset: (s) => titleState(s.muted),
    reconcile: (s) => thaw(s),

    setScreen: (s, screen) => ({
      ...thaw(s),
      screen: assertOneOf(screen, SCREENS, "screen"),
    }),
    setMode: (s, mode) => ({
      ...thaw(s),
      mode: assertOneOf(mode, ["solo", "versus"], "mode"),
    }),
    setMenuIndex: (s, index) => ({
      ...thaw(s),
      menuIndex: assertNumber(index, "menu index"),
    }),
    setTitleIndex: (s, index) => ({
      ...thaw(s),
      titleIndex: assertNumber(index, "title index"),
    }),
    setResumeScreen: (s, screen) => ({
      ...thaw(s),
      resumeScreen: assertOneOf(
        screen,
        ["countdown", "playing"],
        "resume screen",
      ),
    }),

    setScore: (s, p1, p2) => ({
      ...thaw(s),
      score: { p1: assertNumber(p1, "p1"), p2: assertNumber(p2, "p2") },
    }),
    setWinner: (s, side) => ({
      ...thaw(s),
      winner: side === null ? null : assertSide(side),
    }),
    setReceiver: (s, side) => ({ ...thaw(s), receiver: assertSide(side) }),

    setPaddleCy: (s, side, cy) =>
      withPaddle(s, side, { cy: assertNumber(cy, "cy") }),
    setPaddleVy: (s, side, vy) =>
      withPaddle(s, side, { drivenVy: assertNumber(vy, "vy") }),
    setPaddleDriven: (s, side, driven) =>
      withPaddle(s, side, { driven: assertBoolean(driven, "driven") }),

    setBallPosition: (s, x, y) =>
      withBall(s, { x: assertNumber(x, "x"), y: assertNumber(y, "y") }),
    setBallVelocity: (s, vx, vy) =>
      withBall(s, { vx: assertNumber(vx, "vx"), vy: assertNumber(vy, "vy") }),
    setBallSpin: (s, spin) => withBall(s, { spin: assertNumber(spin, "spin") }),
    setBallHeld: (s, held) =>
      withBall(s, { held: assertBoolean(held, "held") }),
    setBallHoldTimer: (s, seconds) =>
      withBall(s, { holdTimer: assertNumber(seconds, "hold timer") }),
    setBallServeSign: (s, sign) =>
      withBall(s, { serveSign: assertOneOf(sign, [1, -1], "serve sign") }),
    drawBallServeSign: (s) => withBall(s, { serveSign: drawServeSign() }),

    setAiTracking: (s, enabled) => ({
      ...thaw(s),
      ai: { ...s.ai, tracking: assertBoolean(enabled, "tracking") },
    }),
    setAiMovement: (s, enabled) => ({
      ...thaw(s),
      ai: { ...s.ai, movement: assertBoolean(enabled, "movement") },
    }),

    setMuted: (s, muted) => ({
      ...thaw(s),
      muted: assertBoolean(muted, "muted"),
    }),

    snapshot: (s) => snapshot(s),
    menuItemRect: (s, index) => menuRect(s.screen, index),
  };
}

function snapshot(s: S): Snapshot {
  const ball = s.ball;
  const trail: TrailSample[] =
    ball === null ? [] : ball.trail.map((t) => ({ ...t }));
  return {
    version: CAROM_DEBUG_VERSION,
    screen: s.screen,
    mode: s.mode,
    menuIndex: s.menuIndex,
    titleIndex: s.titleIndex,
    resumeScreen: s.resumeScreen,
    score: { p1: s.score.p1, p2: s.score.p2 },
    winner: s.winner,
    muted: s.muted,
    paddles: {
      left: { ...s.paddles.left },
      right: { ...s.paddles.right },
    },
    ai: { tracking: s.ai.tracking, movement: s.ai.movement },
    receiver: s.receiver,
    ball:
      ball === null
        ? null
        : { ...ball, speed: Math.hypot(ball.vx, ball.vy), trail },
    obstacles: s.obstacles.map((o) => ({ ...o })),
    simTime: s.simTime,
  };
}
