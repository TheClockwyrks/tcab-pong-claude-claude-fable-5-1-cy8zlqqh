// Carom — the AI opponent (specs/modes/single-player.md).
//
// The AI holds no state of its own. Each frame it reads the ball and its own
// paddle and answers with the velocity the paddle moves at.

import {
  AI_DEADZONE,
  AI_HOME_DEADZONE,
  AI_HOME_Y,
  AI_REACT,
  AI_SPEED,
} from "./constants";
import type { DeepReadonly } from "ts-essentials";
import type { CaromState } from "./game";

/** The vertical velocity the AI drives the right paddle at this frame. */
export function aiVelocity(
  state: DeepReadonly<CaromState>,
  dt: number,
): number {
  if (!state.ai.movement) return 0;

  let target = AI_HOME_Y;
  let deadzone = AI_HOME_DEADZONE;
  const ball = state.ball;
  if (
    state.ai.tracking &&
    state.screen === "playing" &&
    ball !== null &&
    ball.vx > 0
  ) {
    target = ball.y - ball.vy * AI_REACT;
    deadzone = AI_DEADZONE;
  }

  const diff = target - state.paddles.right.cy;
  if (Math.abs(diff) <= deadzone) return 0;
  const reach = dt > 0 ? Math.abs(diff) / dt : AI_SPEED;
  return Math.sign(diff) * Math.min(AI_SPEED, reach);
}
