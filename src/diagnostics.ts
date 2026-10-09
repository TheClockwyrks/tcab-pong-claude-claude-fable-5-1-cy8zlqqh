// Carom — the values the debug overlay shows (specs/instrumentation.md).
//
// Each source is a pure read of the state it is handed, kept to one short line.

import type { InitApi } from "@clockwyrks/simple-2d";
import type { CaromState } from "./game";

const fixed = (value: number): string => value.toFixed(1);

export function registerDiagnostics(
  diagnostics: InitApi<CaromState>["diagnostics"],
): void {
  diagnostics.register("screen", (s) => s.screen);
  diagnostics.register("mode", (s) => s.mode);
  diagnostics.register("score", (s) => `${s.score.p1} - ${s.score.p2}`);
  diagnostics.register("ball", (s) =>
    s.ball === null ? "none" : `${fixed(s.ball.x)}, ${fixed(s.ball.y)}`,
  );
  diagnostics.register("ball v", (s) =>
    s.ball === null ? "none" : `${fixed(s.ball.vx)}, ${fixed(s.ball.vy)}`,
  );
  diagnostics.register("ball speed", (s) =>
    s.ball === null ? "none" : fixed(Math.hypot(s.ball.vx, s.ball.vy)),
  );
  diagnostics.register("ball spin", (s) =>
    s.ball === null ? "none" : fixed(s.ball.spin),
  );
  diagnostics.register(
    "left paddle",
    (s) => `cy ${fixed(s.paddles.left.cy)} vy ${fixed(s.paddles.left.vy)}`,
  );
  diagnostics.register(
    "right paddle",
    (s) => `cy ${fixed(s.paddles.right.cy)} vy ${fixed(s.paddles.right.vy)}`,
  );
}
