// Carom — the ball's physics (specs/balls.md) and the paddle integration
// (specs/playfield.md).
//
// Everything here is a pure function over plain values: the ball, the paddles,
// and the obstacles go in, and the next ball comes out beside the events the
// step raised. Nothing reads a clock or a canvas.

import {
  BALL_R,
  FIELD_H,
  FIELD_W,
  MAX_BOUNCE_ANGLE,
  MAX_SUBSTEP,
  OBSTACLES,
  P1_X0,
  P1_X1,
  P2_X0,
  P2_X1,
  PADDLE_HALF,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  SERVE_ANGLE,
  SERVE_SPEED,
  SPEED_CAP,
  SPEED_MULT,
  SPIN_CLAMP,
  SPIN_FROM_PADDLE,
  SPIN_HALFLIFE,
  WIN_LEAD,
  WIN_SCORE,
} from "./constants";
import type { Rect } from "./constants";
import type { BallState, ObstacleState, PaddleState, Side } from "./game";

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

// ---- Paddles -----------------------------------------------------------------

/**
 * A paddle moved at `vy` for `dt` seconds and clamped to the field. The `vy`
 * carried out is the velocity the paddle actually travelled at, so a paddle
 * pinned against a bound reports `0`.
 */
export function integratePaddle(
  paddle: PaddleState,
  vy: number,
  dt: number,
): PaddleState {
  const next = clamp(paddle.cy + vy * dt, PADDLE_MIN_CY, PADDLE_MAX_CY);
  const unclamped = paddle.cy + vy * dt;
  const actualVy = next !== unclamped && dt > 0 ? (next - paddle.cy) / dt : vy;
  return { ...paddle, cy: next, vy: actualVy };
}

/** The rectangle a paddle on `side` occupies, centered on `cy`. */
export function paddleRect(side: Side, cy: number): Rect {
  return {
    x0: side === "left" ? P1_X0 : P2_X0,
    x1: side === "left" ? P1_X1 : P2_X1,
    y0: cy - PADDLE_HALF,
    y1: cy + PADDLE_HALF,
  };
}

// ---- The ball in flight ------------------------------------------------------

/** The ball's kinematic fields, as the sub-steps carry them. */
interface Motion {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
}

export type Face = "left" | "right" | "top" | "bottom";

/** The events one frame's advance raised, each at most once. */
export interface BallEvents {
  readonly paddleHit: boolean;
  readonly wallBounce: boolean;
  readonly obstacleBounce: boolean;
}

export interface Paddles {
  readonly left: PaddleState;
  readonly right: PaddleState;
}

/**
 * The circle-against-rectangle rule. Returns the face the ball struck, having
 * placed the ball off it and reversed the velocity component pointing into it,
 * or `null` when the ball does not overlap the rectangle.
 */
export function resolveCircleRect(m: Motion, rect: Rect): Face | null {
  const ex0 = rect.x0 - BALL_R;
  const ex1 = rect.x1 + BALL_R;
  const ey0 = rect.y0 - BALL_R;
  const ey1 = rect.y1 + BALL_R;
  if (!(m.x > ex0 && m.x < ex1 && m.y > ey0 && m.y < ey1)) return null;

  const depths: readonly [Face, number][] = [
    ["left", m.x - ex0],
    ["right", ex1 - m.x],
    ["top", m.y - ey0],
    ["bottom", ey1 - m.y],
  ];
  let face: Face = "left";
  let least = Infinity;
  for (const [candidate, depth] of depths) {
    if (depth < least) {
      least = depth;
      face = candidate;
    }
  }

  switch (face) {
    case "left":
      m.x = ex0;
      if (m.vx > 0) m.vx = -m.vx;
      break;
    case "right":
      m.x = ex1;
      if (m.vx < 0) m.vx = -m.vx;
      break;
    case "top":
      m.y = ey0;
      if (m.vy > 0) m.vy = -m.vy;
      break;
    case "bottom":
      m.y = ey1;
      if (m.vy < 0) m.vy = -m.vy;
      break;
  }
  return face;
}

/** The paddle bounce: angle from the contact point, speed-up, and spin. */
function bounceOffPaddle(m: Motion, side: Side, paddle: PaddleState): void {
  const dir = side === "left" ? 1 : -1;
  const offset = clamp((m.y - paddle.cy) / PADDLE_HALF, -1, 1);
  const theta = offset * MAX_BOUNCE_ANGLE;
  const speed = Math.min(Math.hypot(m.vx, m.vy) * SPEED_MULT, SPEED_CAP);
  m.vx = dir * speed * Math.cos(theta);
  m.vy = speed * Math.sin(theta);
  m.spin = clamp(
    m.spin + paddle.vy * SPIN_FROM_PADDLE,
    -SPIN_CLAMP,
    SPIN_CLAMP,
  );
  m.x = side === "left" ? P1_X1 + BALL_R : P2_X0 - BALL_R;
}

/** Walls, then the left paddle, the right paddle, obstacle A, obstacle B. */
function resolveCollisions(
  m: Motion,
  paddles: Paddles,
  obstacles: readonly ObstacleState[],
  events: { paddleHit: boolean; wallBounce: boolean; obstacleBounce: boolean },
): void {
  if (m.y - BALL_R < 0 && m.vy < 0) {
    m.y = BALL_R;
    m.vy = -m.vy;
    events.wallBounce = true;
  } else if (m.y + BALL_R > FIELD_H && m.vy > 0) {
    m.y = FIELD_H - BALL_R;
    m.vy = -m.vy;
    events.wallBounce = true;
  }

  for (const side of ["left", "right"] as const) {
    const paddle = paddles[side];
    const face = resolveCircleRect(m, paddleRect(side, paddle.cy));
    if (face === "left" || face === "right") {
      bounceOffPaddle(m, side, paddle);
      events.paddleHit = true;
    } else if (face !== null) {
      events.wallBounce = true;
    }
  }

  for (const obstacle of obstacles) {
    const rect = OBSTACLES[obstacle.index];
    if (rect !== undefined && resolveCircleRect(m, rect) !== null) {
      events.obstacleBounce = true;
    }
  }
}

/**
 * The ball advanced by `dt` seconds through its sub-steps, against the paddles
 * and the obstacles present. Returns the ball after the frame and the events
 * the frame raised.
 */
export function stepBall(
  ball: BallState,
  paddles: Paddles,
  obstacles: readonly ObstacleState[],
  dt: number,
): { ball: BallState; events: BallEvents } {
  const m: Motion = {
    x: ball.x,
    y: ball.y,
    vx: ball.vx,
    vy: ball.vy,
    spin: ball.spin,
  };
  const events = { paddleHit: false, wallBounce: false, obstacleBounce: false };
  const startSpeed = Math.hypot(m.vx, m.vy);
  const n = Math.max(1, Math.ceil((startSpeed * dt) / MAX_SUBSTEP));
  const h = dt / n;
  const decay = Math.pow(0.5, h / SPIN_HALFLIFE);

  for (let i = 0; i < n; i++) {
    const speed = Math.hypot(m.vx, m.vy);
    if (speed > 0) {
      const angle = (m.spin / speed) * h;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const vx = m.vx * cos - m.vy * sin;
      const vy = m.vx * sin + m.vy * cos;
      m.vx = vx;
      m.vy = vy;
    }
    m.spin *= decay;
    m.x += m.vx * h;
    m.y += m.vy * h;
    resolveCollisions(m, paddles, obstacles, events);
  }

  return {
    ball: { ...ball, x: m.x, y: m.y, vx: m.vx, vy: m.vy, spin: m.spin },
    events,
  };
}

// ---- Serving and scoring -----------------------------------------------------

/** The ball served toward `receiver` at `SERVE_SPEED`, with its hold ended. */
export function serveBall(ball: BallState, receiver: Side): BallState {
  const dir = receiver === "left" ? -1 : 1;
  return {
    ...ball,
    held: false,
    holdTimer: 0,
    vx: dir * SERVE_SPEED * Math.cos(SERVE_ANGLE),
    vy: ball.serveSign * SERVE_SPEED * Math.sin(SERVE_ANGLE),
    trail: [],
  };
}

/** The side that scores off the ball's position, or `null` while it is in play. */
export function scoringSide(ball: BallState): Side | null {
  if (ball.x - BALL_R > FIELD_W) return "left";
  if (ball.x + BALL_R < 0) return "right";
  return null;
}

/** The winner under the win rule, or `null` while the match goes on. */
export function matchWinner(score: {
  readonly p1: number;
  readonly p2: number;
}): Side | null {
  if (score.p1 >= WIN_SCORE && score.p1 - score.p2 >= WIN_LEAD) return "left";
  if (score.p2 >= WIN_SCORE && score.p2 - score.p1 >= WIN_LEAD) return "right";
  return null;
}
