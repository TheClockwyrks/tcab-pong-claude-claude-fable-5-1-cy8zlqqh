// Carom — the frame transition (specs/ui.md, specs/balls.md).
//
// `updateGame` is the whole of what a frame does to the state: it mirrors the
// mute bit, accumulates simulation time, reads the input the current screen
// reads, and advances the screen the input left it on.

import type { PointerSample, UpdateApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { CUES, HOLD_TIME, PADDLE_SPEED, TRAIL_TIME } from "./constants";
import { aiVelocity } from "./ai";
import type { CaromState, MenuPress, PaddleState, Screen, Side } from "./game";
import { menuItemAt, menuItems } from "./menu";
import {
  integratePaddle,
  matchWinner,
  scoringSide,
  serveBall,
  stepBall,
} from "./physics";
import { parkedBall, returnToTitle, startMatch, thaw } from "./state";

/** The press edges one frame carries, each read once. */
interface Edges {
  readonly up: boolean;
  readonly down: boolean;
  readonly confirm: boolean;
  readonly back: boolean;
  readonly pause: boolean;
  readonly mute: boolean;
}

/** The movement actions held this frame, `1` while down and `0` otherwise. */
interface Held {
  readonly p1Up: number;
  readonly p1Down: number;
  readonly p2Up: number;
  readonly p2Down: number;
}

type Input = UpdateApi["input"];
type Audio = UpdateApi["audio"];

function readEdges(input: Input): Edges {
  const p1Up = input.pressed("p1-up");
  const p1Down = input.pressed("p1-down");
  const p2Up = input.pressed("p2-up");
  const p2Down = input.pressed("p2-down");
  return {
    up: p1Up || p2Up,
    down: p1Down || p2Down,
    confirm: input.pressed("confirm"),
    back: input.pressed("back"),
    pause: input.pressed("pause"),
    mute: input.pressed("mute"),
  };
}

function readHeld(input: Input): Held {
  return {
    p1Up: input.value("p1-up"),
    p1Down: input.value("p1-down"),
    p2Up: input.value("p2-up"),
    p2Down: input.value("p2-down"),
  };
}

export function updateGame(
  state: DeepReadonly<CaromState>,
  api: UpdateApi,
  dt: number,
): CaromState {
  const edges = readEdges(api.input);
  const held = readHeld(api.input);
  const samples = api.input.pointerSamples();

  // The state's `muted` is authoritative: a pose that set it reaches the bus on
  // the next frame, and the `mute` action toggles the bus from there.
  if (api.audio.muted() !== state.muted) api.audio.setMuted(state.muted);
  if (edges.mute) api.audio.setMuted(!api.audio.muted());

  let next: CaromState = {
    ...thaw(state),
    muted: api.audio.muted(),
    simTime: state.simTime + dt,
  };

  const began = state.screen;
  switch (began) {
    case "title":
    case "howto":
    case "paused":
    case "matchover":
      next = applyMenuInput(next, began, edges, samples);
      break;
    case "countdown":
    case "playing":
      if (edges.pause) {
        next = {
          ...next,
          resumeScreen: began,
          screen: "paused",
          menuIndex: 0,
        };
      }
      break;
  }
  if (next.screen !== began) next = { ...next, menuPress: null };

  if (next.screen === "countdown" || next.screen === "playing") {
    next = advanceMatch(next, held, api.audio, dt);
  }
  return next;
}

// ---- Menus -------------------------------------------------------------------

function resume(state: CaromState): CaromState {
  return { ...state, screen: state.resumeScreen };
}

/** The effect of confirming item `index` on the menu `screen` shows. */
function confirmItem(
  state: CaromState,
  screen: Screen,
  index: number,
): CaromState {
  switch (screen) {
    case "title": {
      const remembered = { ...state, titleIndex: index };
      if (index === 0) return startMatch(remembered, "solo");
      if (index === 1) return startMatch(remembered, "versus");
      if (index === 2) return { ...remembered, screen: "howto", menuIndex: 0 };
      return state;
    }
    case "howto":
      return returnToTitle(state);
    case "paused":
      if (index === 0) return resume(state);
      if (index === 1) return startMatch(state, state.mode);
      if (index === 2) return returnToTitle(state);
      return state;
    case "matchover":
      if (index === 0) return startMatch(state, state.mode);
      if (index === 1) return returnToTitle(state);
      return state;
    case "countdown":
    case "playing":
      return state;
  }
}

function applyMenuInput(
  state: CaromState,
  screen: Screen,
  edges: Edges,
  samples: readonly PointerSample[],
): CaromState {
  if (screen === "paused" && (edges.pause || edges.back)) return resume(state);
  if ((screen === "howto" || screen === "matchover") && edges.back) {
    return returnToTitle(state);
  }

  const count = menuItems(screen).length;
  let next = state;
  if (edges.up) {
    next = { ...next, menuIndex: (next.menuIndex - 1 + count) % count };
  } else if (edges.down) {
    next = { ...next, menuIndex: (next.menuIndex + 1) % count };
  } else if (edges.confirm) {
    return confirmItem(next, screen, next.menuIndex);
  }
  return applyPointer(next, screen, samples);
}

/**
 * The pointer and touch samples over the menu on `screen`, in arrival order. A
 * contact landing on or travelling onto an item selects it; a press and its
 * release inside one item confirm that item.
 */
function applyPointer(
  state: CaromState,
  screen: Screen,
  samples: readonly PointerSample[],
): CaromState {
  let menuIndex = state.menuIndex;
  let press: MenuPress | null = state.menuPress;
  for (const sample of samples) {
    const hit = menuItemAt(screen, sample.x, sample.y);
    switch (sample.type) {
      case "down":
        if (hit !== null) menuIndex = hit;
        press = hit === null ? null : { pointerId: sample.id, index: hit };
        break;
      case "move":
        if (hit !== null) menuIndex = hit;
        break;
      case "up": {
        const confirms =
          hit !== null &&
          press !== null &&
          press.pointerId === sample.id &&
          press.index === hit;
        if (press !== null && press.pointerId === sample.id) press = null;
        if (confirms) {
          return confirmItem(
            { ...state, menuIndex: hit, menuPress: null },
            screen,
            hit,
          );
        }
        break;
      }
    }
  }
  return { ...state, menuIndex, menuPress: press };
}

// ---- The live field ------------------------------------------------------------

/** The velocity a human-controlled paddle moves at from the actions held. */
function humanVy(up: number, down: number): number {
  return (down - up) * PADDLE_SPEED;
}

/** The velocity the paddle on `side` is driven at this frame, whoever moves it. */
function paddleCommand(
  state: CaromState,
  side: Side,
  held: Held,
  dt: number,
): number {
  const paddle = state.paddles[side];
  if (paddle.driven) return paddle.drivenVy;
  if (side === "left") {
    if (state.mode === "solo") {
      const up = Math.max(held.p1Up, held.p2Up);
      const down = Math.max(held.p1Down, held.p2Down);
      return humanVy(up, down);
    }
    return humanVy(held.p1Up, held.p1Down);
  }
  if (state.mode === "solo") return aiVelocity(state, dt);
  return humanVy(held.p2Up, held.p2Down);
}

function movePaddles(
  state: CaromState,
  held: Held,
  dt: number,
): { left: PaddleState; right: PaddleState } {
  return {
    left: integratePaddle(
      state.paddles.left,
      paddleCommand(state, "left", held, dt),
      dt,
    ),
    right: integratePaddle(
      state.paddles.right,
      paddleCommand(state, "right", held, dt),
      dt,
    ),
  };
}

/** A `countdown` or `playing` frame: the paddles, the ball, and the score. */
function advanceMatch(
  state: CaromState,
  held: Held,
  audio: Audio,
  dt: number,
): CaromState {
  const paddles = movePaddles(state, held, dt);
  let next: CaromState = { ...state, paddles };
  if (state.ball === null) return next;

  if (state.screen === "countdown") {
    const holdTimer = state.ball.holdTimer - dt;
    if (holdTimer <= 0) {
      next = {
        ...next,
        ball: serveBall(state.ball, state.receiver),
        screen: "playing",
      };
    } else {
      next = { ...next, ball: { ...state.ball, holdTimer } };
    }
  } else {
    const { ball, events } = stepBall(state.ball, paddles, state.obstacles, dt);
    if (events.paddleHit) audio.play(CUES.paddleHit);
    if (events.wallBounce) audio.play(CUES.wallBounce);
    if (events.obstacleBounce) audio.play(CUES.obstacleBounce);
    next = scorePoint({ ...next, ball }, audio);
  }

  return recordTrail(next);
}

/** The point the ball's position scores, if any, and what follows it. */
function scorePoint(state: CaromState, audio: Audio): CaromState {
  if (state.ball === null) return state;
  const scorer = scoringSide(state.ball);
  if (scorer === null) return state;

  audio.play(CUES.score);
  const score =
    scorer === "left"
      ? { p1: state.score.p1 + 1, p2: state.score.p2 }
      : { p1: state.score.p1, p2: state.score.p2 + 1 };
  const winner = matchWinner(score);
  if (winner !== null) {
    return { ...state, score, winner, screen: "matchover", menuIndex: 0 };
  }
  return {
    ...state,
    score,
    receiver: scorer === "left" ? "right" : "left",
    ball: { ...parkedBall(), holdTimer: HOLD_TIME },
    screen: "countdown",
  };
}

/** The ball's position appended to its trail, and the stale samples dropped. */
function recordTrail(state: CaromState): CaromState {
  if (state.ball === null) return state;
  const t = state.simTime;
  const trail = [
    ...state.ball.trail.filter((sample) => t - sample.t <= TRAIL_TIME),
    { x: state.ball.x, y: state.ball.y, t },
  ];
  return { ...state, ball: { ...state.ball, trail } };
}
