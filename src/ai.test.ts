import { describe, expect, it } from "vitest";
import {
  AI_DEADZONE,
  AI_HOME_DEADZONE,
  AI_HOME_Y,
  AI_REACT,
  AI_SPEED,
} from "./constants";
import { aiVelocity } from "./ai";
import type { CaromState } from "./game";
import { titleState } from "./state";

function withBall(
  state: CaromState,
  patch: { x?: number; y?: number; vx?: number; vy?: number },
): CaromState {
  return { ...state, ball: { ...state.ball!, ...patch } };
}

function withRight(state: CaromState, cy: number): CaromState {
  return {
    ...state,
    paddles: { ...state.paddles, right: { ...state.paddles.right, cy } },
  };
}

const dt = 1 / 60;

describe("aiVelocity", () => {
  it("rests at home within the home deadzone", () => {
    const s = withRight(titleState(false), AI_HOME_Y + AI_HOME_DEADZONE);
    expect(aiVelocity(s, dt)).toBe(0);
    const away = withRight(titleState(false), AI_HOME_Y + AI_HOME_DEADZONE + 1);
    expect(aiVelocity(away, dt)).toBe(-AI_SPEED);
  });

  it("returns home while the ball travels away or the screen is not playing", () => {
    const base = {
      ...withRight(titleState(false), 100),
      screen: "playing" as const,
    };
    const away = withBall(base, { y: 600, vx: -300, vy: 0 });
    expect(aiVelocity(away, dt)).toBe(AI_SPEED);
    const countdown = {
      ...withBall(base, { y: 600, vx: 300 }),
      screen: "countdown" as const,
    };
    expect(aiVelocity(countdown, dt)).toBe(AI_SPEED);
  });

  it("tracks the ball's lead point while it approaches", () => {
    const base = {
      ...withRight(titleState(false), 360),
      screen: "playing" as const,
    };
    const coming = withBall(base, { y: 360, vx: 300, vy: -400 });
    // target = 360 - (-400 * 0.12) = 408, diff 48 > deadzone, capped at AI_SPEED
    expect(aiVelocity(coming, dt)).toBe(AI_SPEED);
    const near = withBall(base, { y: 365, vx: 300, vy: 0 });
    expect(aiVelocity(near, dt)).toBe(0);
    const justOut = withBall(base, {
      y: 360 + AI_DEADZONE + 0.5,
      vx: 300,
      vy: 0,
    });
    expect(aiVelocity(justOut, 0.1)).toBeCloseTo((AI_DEADZONE + 0.5) / 0.1, 9);
    expect(aiVelocity(justOut, 0.1)).toBeLessThan(AI_SPEED);
    const lead = withBall(base, { y: 360, vx: 300, vy: 100 });
    expect(Math.sign(aiVelocity(lead, dt))).toBe(Math.sign(-100 * AI_REACT));
  });

  it("goes home with tracking off and stays put with movement off", () => {
    const base = {
      ...withRight(titleState(false), 100),
      screen: "playing" as const,
    };
    const coming = withBall(base, { y: 600, vx: 300, vy: 0 });
    expect(
      aiVelocity({ ...coming, ai: { tracking: false, movement: true } }, dt),
    ).toBe(AI_SPEED);
    expect(
      aiVelocity({ ...coming, ai: { tracking: true, movement: false } }, dt),
    ).toBe(0);
  });

  it("treats an absent ball as nothing to defend", () => {
    const s = {
      ...withRight(titleState(false), 100),
      screen: "playing" as const,
      ball: null,
    };
    expect(aiVelocity(s, dt)).toBe(AI_SPEED);
  });

  it("caps at top speed on a zero-length frame", () => {
    const s = withRight(titleState(false), 100);
    expect(aiVelocity(s, 0)).toBe(AI_SPEED);
  });
});
