// Captures a replay of a staged rally with the engine's recorder and writes it
// gzipped beside the showcase:
//
//   node tools/run.mjs tools/capture-replay.ts showcase/rally.json.gz
//
// The rally is driven through the debug surface over the headless harness, so
// it is the game's own drawing, frame by frame, at a steady 60 frames a second.

import { gzipSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { createHarness } from "../src/harness";

export default async function captureReplay(args: string[]): Promise<void> {
  const out = args[0] ?? "showcase/rally.json.gz";
  const h = await createHarness();
  try {
    // Open a solo match: the AI defends the right, a driven paddle the left.
    h.pose((d, s) => d.setMode(s, "solo"));
    h.pose((d, s) => d.setScreen(s, "countdown"));
    h.pose((d, s) => d.setBallServeSign(s, 1));
    h.pose((d, s) => d.setBallHoldTimer(s, 0.4));
    h.pose((d, s) => d.setPaddleDriven(s, "left", true));
    h.pose((d, s) => d.setPaddleVy(s, "left", 0));

    const played = new Map<string, number>();
    h.engine.events.on("cue:played", (e) =>
      played.set(e.cue, (played.get(e.cue) ?? 0) + 1),
    );
    h.engine.startRecording();
    const totalFrames = 60 * 9;
    for (let frame = 0; frame < totalFrames; frame++) {
      const s = h.state();
      // The left paddle chases the ball, leaning into each strike for spin.
      if (s.ball !== null && !s.ball.held) {
        const lead = s.ball.y + (s.ball.vx < 0 ? s.ball.vy * 0.2 : 0);
        const diff = lead - s.paddles.left.cy;
        const vy =
          Math.abs(diff) < 6
            ? 0
            : Math.sign(diff) * Math.min(700, Math.abs(diff) * 12);
        h.pose((d, st) => d.setPaddleVy(st, "left", vy));
      }
      await h.advance(1);
    }
    const recording = h.engine.stopRecording();
    const bytes = gzipSync(Buffer.from(JSON.stringify(recording)));
    writeFileSync(out, bytes);
    const snap = h.snap();
    const cues = [...played].map(([cue, n]) => `${cue} x${n}`).join(", ");
    console.log(
      `${out}: ${recording.frames.length} frames, ${bytes.length} bytes gzipped, score ${snap.score.p1}-${snap.score.p2}, cues: ${cues}`,
    );
  } finally {
    h.destroy();
  }
}
