import { describe, expect, it } from "vitest";
import {
  BALL_R,
  FIELD_H,
  FIELD_W,
  MAX_BOUNCE_ANGLE,
  OBSTACLE_CENTERS,
  OBSTACLES,
  P1_X1,
  P2_X0,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  SERVE_ANGLE,
  SERVE_SPEED,
  SPEED_CAP,
  SPEED_MULT,
  SPIN_CLAMP,
  SPIN_FROM_PADDLE,
  SPIN_HALFLIFE,
} from "./constants";
import type { BallState, PaddleState } from "./game";
import {
  integratePaddle,
  matchWinner,
  paddleRect,
  resolveCircleRect,
  scoringSide,
  serveBall,
  stepBall,
} from "./physics";
import { allObstacles } from "./state";

const paddle = (cy: number, vy = 0): PaddleState => ({
  cy,
  vy,
  driven: false,
  drivenVy: 0,
});

const ball = (patch: Partial<BallState>): BallState => ({
  x: 640,
  y: 360,
  vx: 0,
  vy: 0,
  spin: 0,
  held: false,
  holdTimer: 0,
  serveSign: 1,
  trail: [],
  ...patch,
});

const paddles = { left: paddle(360), right: paddle(360) };
const noObstacles: never[] = [];

describe("integratePaddle", () => {
  it("moves at vy and reports it", () => {
    const next = integratePaddle(paddle(360), 720, 0.1);
    expect(next.cy).toBeCloseTo(432, 9);
    expect(next.vy).toBe(720);
  });

  it("clamps to the field and reports the velocity actually travelled", () => {
    const next = integratePaddle(paddle(650), 720, 0.1);
    expect(next.cy).toBe(PADDLE_MAX_CY);
    expect(next.vy).toBeCloseTo((PADDLE_MAX_CY - 650) / 0.1, 9);
    const pinned = integratePaddle(paddle(PADDLE_MIN_CY), -720, 0.016);
    expect(pinned.cy).toBe(PADDLE_MIN_CY);
    expect(pinned.vy).toBe(0);
  });

  it("keeps the commanded vy on a zero-length frame", () => {
    const next = integratePaddle(paddle(PADDLE_MIN_CY), -720, 0);
    expect(next.cy).toBe(PADDLE_MIN_CY);
    expect(next.vy).toBe(-720);
  });

  it("leaves the driven fields alone", () => {
    const next = integratePaddle(
      { cy: 300, vy: 0, driven: true, drivenVy: 50 },
      50,
      0.5,
    );
    expect(next).toEqual({ cy: 325, vy: 50, driven: true, drivenVy: 50 });
  });
});

describe("resolveCircleRect", () => {
  const rect = { x0: 100, y0: 100, x1: 120, y1: 240 };

  it("returns null when the ball does not overlap the expanded rectangle", () => {
    const m = { x: 100 - BALL_R - 1, y: 170, vx: 10, vy: 0, spin: 0 };
    expect(resolveCircleRect(m, rect)).toBeNull();
    expect(m.x).toBe(100 - BALL_R - 1);
    const edge = { x: 100 - BALL_R, y: 170, vx: 10, vy: 0, spin: 0 };
    expect(resolveCircleRect(edge, rect)).toBeNull();
  });

  it("strikes the left face, placing the ball off it and reversing vx", () => {
    const m = { x: 92, y: 170, vx: 300, vy: 20, spin: 5 };
    expect(resolveCircleRect(m, rect)).toBe("left");
    expect(m.x).toBe(100 - BALL_R);
    expect(m.vx).toBe(-300);
    expect(m.vy).toBe(20);
    expect(m.spin).toBe(5);
  });

  it("strikes the right face and leaves a velocity already pointing away", () => {
    const m = { x: 128, y: 170, vx: 300, vy: 0, spin: 0 };
    expect(resolveCircleRect(m, rect)).toBe("right");
    expect(m.x).toBe(120 + BALL_R);
    expect(m.vx).toBe(300);
  });

  it("strikes the top and bottom faces", () => {
    const top = { x: 110, y: 93, vx: 0, vy: 50, spin: 0 };
    expect(resolveCircleRect(top, rect)).toBe("top");
    expect(top.y).toBe(100 - BALL_R);
    expect(top.vy).toBe(-50);
    const bottom = { x: 110, y: 247, vx: 0, vy: -50, spin: 0 };
    expect(resolveCircleRect(bottom, rect)).toBe("bottom");
    expect(bottom.y).toBe(240 + BALL_R);
    expect(bottom.vy).toBe(50);
  });

  it("breaks a tie in the order left, right, top, bottom", () => {
    // Equal depth on the left and top faces: left wins.
    const m = {
      x: 100 - BALL_R + 4,
      y: 100 - BALL_R + 4,
      vx: 1,
      vy: 1,
      spin: 0,
    };
    expect(resolveCircleRect(m, rect)).toBe("left");
    const rt = {
      x: 120 + BALL_R - 4,
      y: 100 - BALL_R + 4,
      vx: -1,
      vy: 1,
      spin: 0,
    };
    expect(resolveCircleRect(rt, rect)).toBe("right");
  });
});

describe("paddleRect", () => {
  it("spans each paddle's fixed x range around cy", () => {
    expect(paddleRect("left", 300)).toEqual({
      x0: 48,
      x1: 64,
      y0: 245,
      y1: 355,
    });
    expect(paddleRect("right", 300)).toEqual({
      x0: 1216,
      x1: 1232,
      y0: 245,
      y1: 355,
    });
  });
});

describe("stepBall", () => {
  it("advances in sub-steps of at most MAX_SUBSTEP units", () => {
    const { ball: next } = stepBall(
      ball({ vx: 900, vy: 0 }),
      paddles,
      noObstacles,
      0.02,
    );
    expect(next.x).toBeCloseTo(658, 9);
    expect(next.y).toBe(360);
  });

  it("uses at least one sub-step for a resting ball", () => {
    const { ball: next, events } = stepBall(
      ball({}),
      paddles,
      noObstacles,
      0.016,
    );
    expect(next).toMatchObject({ x: 640, y: 360, vx: 0, vy: 0 });
    expect(events).toEqual({
      paddleHit: false,
      wallBounce: false,
      obstacleBounce: false,
    });
  });

  it("turns the velocity clockwise under positive spin without changing speed", () => {
    const { ball: next } = stepBall(
      ball({ vx: 400, vy: 0, spin: 400 }),
      paddles,
      noObstacles,
      0.1,
    );
    expect(next.vy).toBeGreaterThan(0);
    expect(Math.hypot(next.vx, next.vy)).toBeCloseTo(400, 6);
    const angle = Math.atan2(next.vy, next.vx);
    expect(angle).toBeGreaterThan(0.05);
    expect(angle).toBeLessThan(0.1);
  });

  it("turns counter-clockwise under negative spin", () => {
    const { ball: next } = stepBall(
      ball({ vx: 400, vy: 0, spin: -400 }),
      paddles,
      noObstacles,
      0.1,
    );
    expect(next.vy).toBeLessThan(0);
  });

  it("halves the spin every SPIN_HALFLIFE seconds", () => {
    const { ball: next } = stepBall(
      ball({ vx: 10, vy: 0, spin: 800 }),
      paddles,
      noObstacles,
      SPIN_HALFLIFE,
    );
    expect(next.spin).toBeCloseTo(400, 6);
  });

  it("reflects off the top wall, keeping speed and spin", () => {
    const { ball: next, events } = stepBall(
      ball({ x: 300, y: BALL_R + 2, vx: 100, vy: -400, spin: 120 }),
      paddles,
      noObstacles,
      0.02,
    );
    expect(events.wallBounce).toBe(true);
    expect(next.vy).toBeGreaterThan(0);
    expect(next.y).toBeGreaterThanOrEqual(BALL_R);
    expect(Math.hypot(next.vx, next.vy)).toBeCloseTo(Math.hypot(100, 400), 6);
    expect(next.spin).toBeLessThan(120);
    expect(next.spin).toBeGreaterThan(110);
  });

  it("reflects off the bottom wall", () => {
    const { ball: next, events } = stepBall(
      ball({ x: 300, y: FIELD_H - BALL_R - 2, vx: 0, vy: 400 }),
      paddles,
      noObstacles,
      0.02,
    );
    expect(events.wallBounce).toBe(true);
    expect(next.vy).toBe(-400);
    expect(next.y).toBeLessThanOrEqual(FIELD_H - BALL_R);
  });

  it("bounces off the left paddle's center straight across, sped up", () => {
    const { ball: next, events } = stepBall(
      ball({ x: P1_X1 + BALL_R + 6, y: 360, vx: -500, vy: 0 }),
      paddles,
      noObstacles,
      0.02,
    );
    expect(events.paddleHit).toBe(true);
    expect(next.vx).toBeCloseTo(500 * SPEED_MULT, 3);
    expect(Math.abs(next.vy)).toBeLessThan(1e-9);
    expect(next.x).toBeGreaterThanOrEqual(P1_X1 + BALL_R);
  });

  it("sends a hit at the paddle's top edge upward at MAX_BOUNCE_ANGLE", () => {
    const { ball: next } = stepBall(
      ball({ x: P2_X0 - BALL_R - 2, y: 360 - 55, vx: 400, vy: 0 }),
      paddles,
      noObstacles,
      0.01,
    );
    const theta = Math.atan2(next.vy, -next.vx);
    expect(theta).toBeCloseTo(-MAX_BOUNCE_ANGLE, 6);
    expect(next.vx).toBeLessThan(0);
  });

  it("clamps the offset past the paddle's edge to the full bounce angle", () => {
    const { ball: next } = stepBall(
      ball({ x: P1_X1 + BALL_R + 1, y: 360 + 62, vx: -400, vy: 0 }),
      paddles,
      noObstacles,
      0.004,
    );
    expect(Math.atan2(next.vy, next.vx)).toBeCloseTo(MAX_BOUNCE_ANGLE, 6);
  });

  it("caps the speed at SPEED_CAP", () => {
    const { ball: next } = stepBall(
      ball({ x: P1_X1 + BALL_R + 1, y: 360, vx: -975, vy: 0 }),
      paddles,
      noObstacles,
      0.002,
    );
    expect(Math.hypot(next.vx, next.vy)).toBeCloseTo(SPEED_CAP, 6);
  });

  it("adds spin from a moving paddle, clamped, and none from a still one", () => {
    const moving = { left: paddle(360, 600), right: paddle(360) };
    const { ball: spun } = stepBall(
      ball({ x: P1_X1 + BALL_R + 1, y: 360, vx: -400, vy: 0, spin: 100 }),
      moving,
      noObstacles,
      0.01,
    );
    const expected =
      100 * Math.pow(0.5, 0.01 / SPIN_HALFLIFE) + 600 * SPIN_FROM_PADDLE;
    expect(spun.spin).toBeCloseTo(expected, 6);

    const upward = { left: paddle(360), right: paddle(360, -720) };
    const { ball: negative } = stepBall(
      ball({ x: P2_X0 - BALL_R - 1, y: 360, vx: 400, vy: 0, spin: -500 }),
      upward,
      noObstacles,
      0.01,
    );
    expect(negative.spin).toBe(-SPIN_CLAMP);

    const { ball: still } = stepBall(
      ball({ x: P1_X1 + BALL_R + 1, y: 360, vx: -400, vy: 0, spin: 0 }),
      paddles,
      noObstacles,
      0.01,
    );
    expect(still.spin).toBe(0);
    expect(still.vx).toBeGreaterThan(0);
  });

  it("treats a paddle end cap like a wall", () => {
    const left = paddle(360);
    const { ball: next, events } = stepBall(
      ball({ x: 56, y: 360 - 55 - BALL_R - 1, vx: 0, vy: 200, spin: 0 }),
      { left, right: paddle(360) },
      noObstacles,
      0.02,
    );
    expect(events.wallBounce).toBe(true);
    expect(events.paddleHit).toBe(false);
    expect(next.vy).toBe(-200);
    expect(next.vx).toBe(0);
    expect(next.y).toBeLessThanOrEqual(360 - 55 - BALL_R);
    expect(next.spin).toBe(0);
  });

  it("bounces off an obstacle, keeping speed and spin, and raises its event", () => {
    const a = OBSTACLE_CENTERS[0]!;
    const { ball: next, events } = stepBall(
      ball({ x: a.x - 10 - BALL_R - 3, y: a.y, vx: 600, vy: 0, spin: 50 }),
      paddles,
      allObstacles(),
      0.01,
    );
    expect(events.obstacleBounce).toBe(true);
    expect(next.vx).toBeCloseTo(-600, 2);
    expect(Math.hypot(next.vx, next.vy)).toBeCloseTo(600, 9);
    expect(next.x).toBeLessThanOrEqual(OBSTACLES[0]!.x0 - BALL_R);
    expect(next.spin).toBeLessThan(50);
    expect(next.spin).toBeGreaterThan(49);
  });

  it("passes through an absent obstacle", () => {
    const a = OBSTACLE_CENTERS[0]!;
    const { ball: next, events } = stepBall(
      ball({ x: a.x - 10 - BALL_R - 3, y: a.y, vx: 600, vy: 0 }),
      paddles,
      [allObstacles()[1]!],
      0.1,
    );
    expect(events.obstacleBounce).toBe(false);
    expect(next.x).toBeGreaterThan(a.x);
  });

  it("keeps the ball inside the field and outside every body at the speed cap", () => {
    let b = ball({
      x: 400,
      y: 200,
      vx: SPEED_CAP * 0.7,
      vy: SPEED_CAP * 0.714,
    });
    const fast = { left: paddle(200, 700), right: paddle(500, -700) };
    for (let i = 0; i < 600; i++) {
      b = stepBall(b, fast, allObstacles(), 1 / 60).ball;
      if (scoringSide(b) !== null) {
        b = { ...b, x: 640, y: 300 };
      }
      expect(b.y).toBeGreaterThanOrEqual(BALL_R - 1e-9);
      expect(b.y).toBeLessThanOrEqual(FIELD_H - BALL_R + 1e-9);
      for (const rect of OBSTACLES) {
        const inside =
          b.x > rect.x0 - BALL_R &&
          b.x < rect.x1 + BALL_R &&
          b.y > rect.y0 - BALL_R &&
          b.y < rect.y1 + BALL_R;
        expect(inside).toBe(false);
      }
      expect(Math.hypot(b.vx, b.vy)).toBeLessThanOrEqual(SPEED_CAP + 1e-6);
    }
  });
});

describe("serveBall", () => {
  it("serves toward the receiver at SERVE_SPEED and SERVE_ANGLE", () => {
    const left = serveBall(
      ball({ held: true, holdTimer: 1, serveSign: 1 }),
      "left",
    );
    expect(left.held).toBe(false);
    expect(left.holdTimer).toBe(0);
    expect(left.vx).toBeCloseTo(-SERVE_SPEED * Math.cos(SERVE_ANGLE), 9);
    expect(left.vy).toBeCloseTo(SERVE_SPEED * Math.sin(SERVE_ANGLE), 9);
    expect(left.serveSign).toBe(1);
    const right = serveBall(ball({ serveSign: -1 }), "right");
    expect(right.vx).toBeGreaterThan(0);
    expect(right.vy).toBeLessThan(0);
    expect(Math.hypot(right.vx, right.vy)).toBeCloseTo(SERVE_SPEED, 9);
  });
});

describe("scoring", () => {
  it("scores once the ball is wholly past a goal line", () => {
    expect(scoringSide(ball({ x: FIELD_W + BALL_R }))).toBeNull();
    expect(scoringSide(ball({ x: FIELD_W + BALL_R + 0.01 }))).toBe("left");
    expect(scoringSide(ball({ x: -BALL_R }))).toBeNull();
    expect(scoringSide(ball({ x: -BALL_R - 0.01 }))).toBe("right");
  });

  it("applies the win rule", () => {
    expect(matchWinner({ p1: 10, p2: 0 })).toBeNull();
    expect(matchWinner({ p1: 11, p2: 9 })).toBe("left");
    expect(matchWinner({ p1: 11, p2: 10 })).toBeNull();
    expect(matchWinner({ p1: 12, p2: 10 })).toBe("left");
    expect(matchWinner({ p1: 9, p2: 11 })).toBe("right");
    expect(matchWinner({ p1: 13, p2: 14 })).toBeNull();
    expect(matchWinner({ p1: 13, p2: 15 })).toBe("right");
  });
});
