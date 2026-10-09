import { describe, expect, it } from "vitest";
import { JitterClock, SequenceClock } from "@clockwyrks/simple-2d";
import type { Clock } from "@clockwyrks/simple-2d";
import { createHarness } from "./harness";
import type { Snapshot } from "./game";

interface Run {
  readonly contacts: number;
  readonly walls: number;
  readonly score: { p1: number; p2: number };
  readonly time: number;
  /** The ball on the frame of the first paddle contact. */
  readonly returned: NonNullable<Snapshot["ball"]>;
}

/**
 * One rally driven under `clock`: the ball served toward a driven left paddle
 * that drifts downward as it strikes, so the return carries spin and curves on
 * its way across, until a point is scored.
 */
async function drive(clock: Clock): Promise<Run> {
  const h = await createHarness({ clock });
  try {
    h.pose((d, s) => d.setScreen(s, "countdown"));
    h.pose((d, s) => d.setMode(s, "versus"));
    h.pose((d, s) => d.setBallServeSign(s, 1));
    h.pose((d, s) => d.setBallHoldTimer(s, 0.05));
    h.pose((d, s) => d.setPaddleDriven(s, "left", true));
    h.pose((d, s) => d.setPaddleVy(s, "left", 100));
    h.pose((d, s) => d.setPaddleCy(s, "left", 380));
    h.pose((d, s) => d.setPaddleDriven(s, "right", true));
    h.pose((d, s) => d.setPaddleVy(s, "right", 0));
    h.pose((d, s) => d.setPaddleCy(s, "right", 120));

    let contacts = 0;
    let walls = 0;
    let returned: Snapshot["ball"] = null;
    h.engine.events.on("cue:played", (e) => {
      if (e.cue === "paddle-hit") contacts++;
      if (e.cue === "wall-bounce") walls++;
    });

    let frames = 0;
    while (
      h.state().simTime < 8 &&
      h.state().score.p1 + h.state().score.p2 === 0
    ) {
      await h.advance(1);
      frames++;
      if (contacts === 1 && returned === null) returned = h.snap().ball;
      if (frames > 5000) break;
    }
    const s = h.snap();
    return {
      contacts,
      walls,
      score: s.score,
      time: s.simTime,
      returned: returned!,
    };
  } finally {
    h.destroy();
  }
}

describe("delta-time independence", () => {
  it("reaches the same contacts, bounces, and point under 2 ms and 16 ms frames", async () => {
    const fine = await drive(new SequenceClock([2, 3, 2.5]));
    const coarse = await drive(new JitterClock(12, 16, 7));
    expect(fine.contacts).toBeGreaterThan(0);
    expect(fine.contacts).toBe(coarse.contacts);
    expect(fine.walls).toBe(coarse.walls);
    expect(fine.score).toEqual(coarse.score);
    expect(fine.score.p1 + fine.score.p2).toBe(1);
    expect(Math.abs(fine.time - coarse.time) / fine.time).toBeLessThan(0.08);
    expect(Math.abs(fine.returned.speed - coarse.returned.speed)).toBeLessThan(
      10,
    );
    expect(Math.sign(fine.returned.vx)).toBe(Math.sign(coarse.returned.vx));
    expect(fine.returned.spin).toBeGreaterThan(0);
    expect(Math.abs(fine.returned.spin - coarse.returned.spin)).toBeLessThan(
      10,
    );
  });
});
