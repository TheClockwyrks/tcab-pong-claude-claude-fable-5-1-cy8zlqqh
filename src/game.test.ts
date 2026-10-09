import { afterEach, describe, expect, it } from "vitest";
import { TOUCH_LAYOUTS } from "@clockwyrks/simple-2d";
import { ACTIONS, CUES, LAYOUT } from "./constants";
import { BACKGROUND, game } from "./game";
import { createHarness } from "./harness";
import type { Harness } from "./harness";

let h: Harness | undefined;
afterEach(() => {
  h?.destroy();
  h = undefined;
});

describe("the game", () => {
  it("registers the layout's eight actions in order", () => {
    expect([...ACTIONS]).toEqual(TOUCH_LAYOUTS[LAYOUT]!.actions);
  });

  it("exports a CSS color as the field background", () => {
    expect(BACKGROUND).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("defines every cue and plays each from the frame its event happens on", async () => {
    h = await createHarness();
    h.pose((d, s) => d.setScreen(s, "playing"));
    h.pose((d, s) => d.setMode(s, "versus"));
    h.pose((d, s) => d.setBallHeld(s, false));
    h.pose((d, s) => d.setBallPosition(s, 80, 360));
    h.pose((d, s) => d.setBallVelocity(s, -500, 0));
    await h.advance(2);
    expect(h.cues).toEqual([CUES.paddleHit]);

    h.pose((d, s) => d.setBallPosition(s, 300, 14));
    h.pose((d, s) => d.setBallVelocity(s, 0, -300));
    await h.advance(1);
    expect(h.cues).toEqual([CUES.paddleHit, CUES.wallBounce]);

    h.pose((d, s) => d.setBallPosition(s, 466, 220));
    h.pose((d, s) => d.setBallVelocity(s, 400, 0));
    await h.advance(1);
    expect(h.cues[h.cues.length - 1]).toBe(CUES.obstacleBounce);

    h.pose((d, s) => d.setBallPosition(s, 1282, 360));
    h.pose((d, s) => d.setBallVelocity(s, 900, 0));
    await h.advance(1);
    expect(h.cues[h.cues.length - 1]).toBe(CUES.score);
  });

  it("plays a cue once per frame however many sub-steps raised it", async () => {
    h = await createHarness({ stepMs: 100 });
    h.pose((d, s) => d.setScreen(s, "playing"));
    h.pose((d, s) => d.setBallHeld(s, false));
    h.pose((d, s) => d.setBallPosition(s, 300, 20));
    h.pose((d, s) => d.setBallVelocity(s, 0, -900));
    await h.advance(1);
    expect(h.cues.filter((c) => c === CUES.wallBounce)).toHaveLength(1);
  });

  it("registers diagnostic sources that read the posed state", async () => {
    h = await createHarness();
    h.pose((d, s) => d.setScore(s, 4, 2));
    h.pose((d, s) => d.setBallVelocity(s, 30, 40));
    const readings = h.engine.diagnostics();
    const byName = Object.fromEntries(readings.map((r) => [r.name, r.value]));
    expect(byName["screen"]).toBe("title");
    expect(byName["mode"]).toBe("solo");
    expect(byName["score"]).toBe("4 - 2");
    expect(byName["ball"]).toBe("640.0, 360.0");
    expect(byName["ball v"]).toBe("30.0, 40.0");
    expect(byName["ball speed"]).toBe("50.0");
    expect(byName["ball spin"]).toBe("0.0");
    expect(byName["left paddle"]).toBe("cy 360.0 vy 0.0");
    expect(byName["right paddle"]).toBe("cy 360.0 vy 0.0");
    expect(readings.every((r) => r.error === undefined)).toBe(true);

    h.pose((d, s) => d.clearWorld(s));
    const cleared = Object.fromEntries(
      h.engine.diagnostics().map((r) => [r.name, r.value]),
    );
    expect(cleared["ball"]).toBe("none");
    expect(cleared["ball speed"]).toBe("none");
    expect(cleared["ball spin"]).toBe("none");
    expect(cleared["ball v"]).toBe("none");
  });

  it("is the object main.ts binds", () => {
    expect(typeof game.initialize).toBe("function");
    expect(typeof game.update).toBe("function");
    expect(typeof game.render).toBe("function");
  });
});
