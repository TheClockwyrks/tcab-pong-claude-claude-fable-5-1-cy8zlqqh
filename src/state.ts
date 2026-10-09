// Carom — building and rebuilding the state.
//
// Every transition the game and the debug surface share lives here: parking the
// ball, opening the title screen, starting a match, and returning to the title.
// Each takes a read-only state and returns a fresh `CaromState`.

import type { DeepReadonly } from "ts-essentials";
import { FIELD_CX, FIELD_CY, HOLD_TIME, OBSTACLE_CENTERS } from "./constants";
import type {
  BallState,
  CaromState,
  Mode,
  ObstacleState,
  PaddleState,
} from "./game";

/**
 * A `DeepReadonly<CaromState>` as a `CaromState`. Every field of the state is
 * declared `readonly` already, so the two types describe the same values; the
 * cast only reconciles the names. Nothing writes through the result.
 */
export function thaw(state: DeepReadonly<CaromState>): CaromState {
  return state as CaromState;
}

/** A fresh serve sign, `1` and `-1` each equally likely. */
export function drawServeSign(): 1 | -1 {
  return Math.random() < 0.5 ? 1 : -1;
}

/** The ball parked at its home point, waiting out a fresh hold. */
export function parkedBall(): BallState {
  return {
    x: FIELD_CX,
    y: FIELD_CY,
    vx: 0,
    vy: 0,
    spin: 0,
    held: true,
    holdTimer: HOLD_TIME,
    serveSign: drawServeSign(),
    trail: [],
  };
}

/** Obstacle `index` at its fixed center. */
export function obstacleAt(index: number): ObstacleState {
  const center = OBSTACLE_CENTERS[index];
  if (center === undefined) {
    throw new RangeError(`Carom: no obstacle has index ${index}`);
  }
  return { index, cx: center.x, cy: center.y };
}

/** Both obstacles, in the order of `OBSTACLE_CENTERS`. */
export function allObstacles(): ObstacleState[] {
  return OBSTACLE_CENTERS.map((_, index) => obstacleAt(index));
}

/** A paddle at rest at the field's vertical center. */
export function restingPaddle(driven = false, drivenVy = 0): PaddleState {
  return { cy: FIELD_CY, vy: 0, driven, drivenVy };
}

/** The whole state as the game opens on the title screen. */
export function titleState(muted: boolean): CaromState {
  return {
    screen: "title",
    mode: "solo",
    menuIndex: 0,
    titleIndex: 0,
    resumeScreen: "playing",
    score: { p1: 0, p2: 0 },
    winner: null,
    paddles: { left: restingPaddle(), right: restingPaddle() },
    ai: { tracking: true, movement: true },
    receiver: "left",
    ball: parkedBall(),
    obstacles: allObstacles(),
    simTime: 0,
    muted,
    menuPress: null,
  };
}

/**
 * A match starting in `mode`: the countdown before the first serve, with the
 * scores cleared, the ball parked, and the paddles centered. The driven flags,
 * the AI faculties, and `titleIndex` keep their values.
 */
export function startMatch(
  state: DeepReadonly<CaromState>,
  mode: Mode,
): CaromState {
  const { left, right } = state.paddles;
  return {
    ...thaw(state),
    mode,
    screen: "countdown",
    resumeScreen: "playing",
    menuIndex: 0,
    score: { p1: 0, p2: 0 },
    winner: null,
    receiver: "left",
    ball: parkedBall(),
    obstacles: allObstacles(),
    paddles: {
      left: restingPaddle(left.driven, left.drivenVy),
      right: restingPaddle(right.driven, right.drivenVy),
    },
    menuPress: null,
  };
}

/**
 * The title screen, reached from a match or a menu. Every declared field takes
 * its title-screen value except `titleIndex`, `simTime`, and `muted`, which keep
 * theirs, and `menuIndex`, which becomes `titleIndex`.
 */
export function returnToTitle(state: DeepReadonly<CaromState>): CaromState {
  return {
    ...titleState(state.muted),
    titleIndex: state.titleIndex,
    menuIndex: state.titleIndex,
    simTime: state.simTime,
  };
}
