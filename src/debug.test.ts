import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AI_HOME_DEADZONE,
  CAROM_DEBUG_VERSION,
  FIELD_CX,
  FIELD_CY,
  HOLD_TIME,
  OBSTACLE_CENTERS,
} from "./constants";
import { createHarness } from "./harness";
import type { Harness } from "./harness";
import { menuItemRect } from "./menu";

let h: Harness;
afterEach(() => {
  h.destroy();
  vi.restoreAllMocks();
});

describe("the debug surface", () => {
  it("carries the version and is what the engine returns", async () => {
    h = await createHarness();
    expect(h.debug.version).toBe(CAROM_DEBUG_VERSION);
    expect(h.engine.debug).toBe(h.debug);
    expect(h.snap().version).toBe(1);
  });

  it("sets and reads back every screen and menu field", async () => {
    h = await createHarness();
    for (const screen of [
      "howto",
      "countdown",
      "playing",
      "paused",
      "matchover",
      "title",
    ] as const) {
      h.pose((d, s) => d.setScreen(s, screen));
      expect(h.snap().screen).toBe(screen);
    }
    h.pose((d, s) => d.setMode(s, "versus"));
    expect(h.snap().mode).toBe("versus");
    h.pose((d, s) => d.setMenuIndex(s, 2));
    expect(h.snap().menuIndex).toBe(2);
    h.pose((d, s) => d.setTitleIndex(s, 1));
    expect(h.snap().titleIndex).toBe(1);
    h.pose((d, s) => d.setResumeScreen(s, "countdown"));
    expect(h.snap().resumeScreen).toBe("countdown");
    expect(h.snap().menuIndex).toBe(2);
    expect(h.snap().screen).toBe("title");
  });

  it("refuses a screen, mode, side, or sign outside the vocabulary", async () => {
    h = await createHarness();
    expect(() => h.pose((d, s) => d.setScreen(s, "lobby" as never))).toThrow(
      /screen/,
    );
    expect(() => h.pose((d, s) => d.setMode(s, "coop" as never))).toThrow(
      /mode/,
    );
    expect(() => h.pose((d, s) => d.setReceiver(s, "middle" as never))).toThrow(
      /side/,
    );
    expect(() => h.pose((d, s) => d.setBallServeSign(s, 0 as never))).toThrow(
      /serve sign/,
    );
    expect(() =>
      h.pose((d, s) => d.setResumeScreen(s, "title" as never)),
    ).toThrow(/resume/);
    expect(() => h.pose((d, s) => d.setScore(s, NaN, 0))).toThrow(/p1/);
    expect(() => h.pose((d, s) => d.setAiTracking(s, "yes" as never))).toThrow(
      /tracking/,
    );
    expect(h.snap().screen).toBe("title");
  });

  it("sets and reads back the match fields", async () => {
    h = await createHarness();
    h.pose((d, s) => d.setScore(s, 7, 3));
    expect(h.snap().score).toEqual({ p1: 7, p2: 3 });
    h.pose((d, s) => d.setWinner(s, "right"));
    expect(h.snap().winner).toBe("right");
    h.pose((d, s) => d.setWinner(s, null));
    expect(h.snap().winner).toBeNull();
    h.pose((d, s) => d.setReceiver(s, "right"));
    expect(h.snap().receiver).toBe("right");
  });

  it("sets and reads back the paddle fields, each alone", async () => {
    h = await createHarness();
    h.pose((d, s) => d.setPaddleCy(s, "left", 123));
    h.pose((d, s) => d.setPaddleVy(s, "right", -250));
    h.pose((d, s) => d.setPaddleDriven(s, "right", true));
    const s = h.snap();
    expect(s.paddles.left).toEqual({
      cy: 123,
      vy: 0,
      driven: false,
      drivenVy: 0,
    });
    expect(s.paddles.right).toEqual({
      cy: FIELD_CY,
      vy: 0,
      driven: true,
      drivenVy: -250,
    });
  });

  it("drives a paddle at drivenVy, integrated and clamped, and hands it back", async () => {
    h = await createHarness();
    h.pose((d, s) => d.setScreen(s, "playing"));
    h.pose((d, s) => d.setPaddleVy(s, "right", -600));
    h.pose((d, s) => d.setPaddleDriven(s, "right", true));
    h.keyDown("ArrowDown");
    await h.advance(1);
    let right = h.snap().paddles.right;
    expect(right.vy).toBe(-600);
    expect(right.cy).toBeCloseTo(FIELD_CY - 10, 9);
    await h.advance(60);
    right = h.snap().paddles.right;
    expect(right.cy).toBe(55);
    expect(right.vy).toBe(0);
    expect(right.drivenVy).toBe(-600);
    h.pose((d, s) => d.setPaddleDriven(s, "right", false));
    h.pose((d, s) => d.setMode(s, "versus"));
    await h.advance(1);
    expect(h.snap().paddles.right.cy).toBeGreaterThan(55);
    expect(h.snap().paddles.right.drivenVy).toBe(-600);
    h.keyUp("ArrowDown");
  });

  it("sets and reads back the ball fields", async () => {
    h = await createHarness();
    h.pose((d, s) => d.setBallPosition(s, 100, 200));
    h.pose((d, s) => d.setBallVelocity(s, 300, -400));
    h.pose((d, s) => d.setBallSpin(s, 250));
    h.pose((d, s) => d.setBallHeld(s, false));
    h.pose((d, s) => d.setBallHoldTimer(s, 0.25));
    h.pose((d, s) => d.setBallServeSign(s, -1));
    const ball = h.snap().ball!;
    expect(ball).toMatchObject({
      x: 100,
      y: 200,
      vx: 300,
      vy: -400,
      speed: 500,
      spin: 250,
      held: false,
      holdTimer: 0.25,
      serveSign: -1,
      trail: [],
    });
  });

  it("draws the serve sign afresh, each sign equally likely", async () => {
    h = await createHarness();
    const random = vi.spyOn(Math, "random");
    random.mockReturnValue(0.2);
    h.pose((d, s) => d.drawBallServeSign(s));
    expect(h.snap().ball?.serveSign).toBe(1);
    random.mockReturnValue(0.8);
    h.pose((d, s) => d.drawBallServeSign(s));
    expect(h.snap().ball?.serveSign).toBe(-1);
    h.pose((d, s) => d.spawnBall(s));
    expect(h.snap().ball?.serveSign).toBe(-1);
  });

  it("fails loudly on every ball pose while the field carries no ball", async () => {
    h = await createHarness();
    h.pose((d, s) => d.clearWorld(s));
    expect(h.snap().ball).toBeNull();
    expect(h.snap().obstacles).toEqual([]);
    const poses = [
      (d: typeof h.debug, s: Parameters<typeof d.setBallSpin>[0]) =>
        d.setBallPosition(s, 1, 2),
      (d: typeof h.debug, s: Parameters<typeof d.setBallSpin>[0]) =>
        d.setBallVelocity(s, 1, 2),
      (d: typeof h.debug, s: Parameters<typeof d.setBallSpin>[0]) =>
        d.setBallSpin(s, 1),
      (d: typeof h.debug, s: Parameters<typeof d.setBallSpin>[0]) =>
        d.setBallHeld(s, true),
      (d: typeof h.debug, s: Parameters<typeof d.setBallSpin>[0]) =>
        d.setBallHoldTimer(s, 1),
      (d: typeof h.debug, s: Parameters<typeof d.setBallSpin>[0]) =>
        d.setBallServeSign(s, 1),
      (d: typeof h.debug, s: Parameters<typeof d.setBallSpin>[0]) =>
        d.drawBallServeSign(s),
    ];
    for (const pose of poses) {
      expect(() => h.pose(pose)).toThrow(/no ball/);
    }
    expect(() => h.pose((d, s) => d.spawnObstacle(s, 2))).toThrow(/obstacle/);
  });

  it("spawns the ball and the obstacles back into their arrangement", async () => {
    h = await createHarness();
    h.pose((d, s) => d.clearWorld(s));
    h.pose((d, s) => d.spawnObstacle(s, 1));
    expect(h.snap().obstacles).toEqual([
      { index: 1, cx: OBSTACLE_CENTERS[1]!.x, cy: OBSTACLE_CENTERS[1]!.y },
    ]);
    h.pose((d, s) => d.spawnObstacle(s, 0));
    h.pose((d, s) => d.spawnObstacle(s, 0));
    expect(h.snap().obstacles.map((o) => o.index)).toEqual([0, 1]);
    h.pose((d, s) => d.spawnBall(s));
    h.pose((d, s) => d.setBallPosition(s, 5, 5));
    h.pose((d, s) => d.spawnBall(s));
    expect(h.snap().ball).toMatchObject({
      x: FIELD_CX,
      y: FIELD_CY,
      vx: 0,
      vy: 0,
      spin: 0,
      held: true,
      holdTimer: HOLD_TIME,
      trail: [],
    });
  });

  it("gates the AI's faculties", async () => {
    h = await createHarness();
    h.pose((d, s) => d.setAiTracking(s, false));
    expect(h.snap().ai).toEqual({ tracking: false, movement: true });
    h.pose((d, s) => d.setAiMovement(s, false));
    expect(h.snap().ai).toEqual({ tracking: false, movement: false });

    h.pose((d, s) => d.setScreen(s, "playing"));
    h.pose((d, s) => d.setPaddleCy(s, "right", 100));
    h.pose((d, s) => d.setBallHeld(s, false));
    h.pose((d, s) => d.setBallPosition(s, 900, 600));
    h.pose((d, s) => d.setBallVelocity(s, 200, 0));
    await h.advance(5);
    expect(h.snap().paddles.right.cy).toBe(100);
    expect(h.snap().paddles.right.vy).toBe(0);

    h.pose((d, s) => d.setAiMovement(s, true));
    await h.advance(30);
    expect(h.snap().paddles.right.cy).toBeGreaterThan(
      FIELD_CY - AI_HOME_DEADZONE,
    );
    expect(h.snap().paddles.right.cy).toBeLessThanOrEqual(FIELD_CY);

    h.pose((d, s) => d.setAiTracking(s, true));
    h.pose((d, s) => d.setBallPosition(s, 900, 600));
    await h.advance(20);
    expect(h.snap().paddles.right.cy).toBeGreaterThan(500);
  });

  it("resets to the title screen, keeping only the mute bit", async () => {
    h = await createHarness();
    await h.tap("KeyS");
    await h.tap("Enter");
    await h.advance(90);
    h.pose((d, s) => d.setPaddleDriven(s, "left", true));
    h.pose((d, s) => d.setPaddleVy(s, "left", 40));
    h.pose((d, s) => d.setAiTracking(s, false));
    h.pose((d, s) => d.setMuted(s, true));
    h.pose((d, s) => d.clearWorld(s));
    h.pose((d, s) => d.reset(s));
    const s = h.snap();
    expect(s.screen).toBe("title");
    expect(s.mode).toBe("solo");
    expect(s.menuIndex).toBe(0);
    expect(s.titleIndex).toBe(0);
    expect(s.simTime).toBe(0);
    expect(s.muted).toBe(true);
    expect(s.paddles.left).toEqual({
      cy: FIELD_CY,
      vy: 0,
      driven: false,
      drivenVy: 0,
    });
    expect(s.ai).toEqual({ tracking: true, movement: true });
    expect(s.ball?.held).toBe(true);
    expect(s.obstacles).toHaveLength(2);
  });

  it("reconciles without changing anything", async () => {
    h = await createHarness();
    h.pose((d, s) => d.setBallVelocity(s, 30, 40));
    const before = h.snap();
    h.pose((d, s) => d.reconcile(s));
    h.pose((d, s) => d.reconcile(s));
    expect(h.snap()).toEqual(before);
    expect(h.snap().ball?.speed).toBe(50);
    h.pose((d, s) => d.clearWorld(s));
    h.pose((d, s) => d.reconcile(s));
    expect(h.snap().ball).toBeNull();
  });

  it("reports the menu regions the build laid out", async () => {
    h = await createHarness();
    expect(h.debug.menuItemRect(h.state(), 0)).toEqual(
      menuItemRect("title", 0),
    );
    expect(h.debug.menuItemRect(h.state(), 2)).toEqual(
      menuItemRect("title", 2),
    );
    expect(h.debug.menuItemRect(h.state(), 3)).toBeNull();
    h.pose((d, s) => d.setScreen(s, "playing"));
    expect(h.debug.menuItemRect(h.state(), 0)).toBeNull();
    h.pose((d, s) => d.setScreen(s, "countdown"));
    expect(h.debug.menuItemRect(h.state(), 0)).toBeNull();
    h.pose((d, s) => d.setScreen(s, "paused"));
    expect(h.debug.menuItemRect(h.state(), 2)).toEqual(
      menuItemRect("paused", 2),
    );
    h.pose((d, s) => d.setScreen(s, "matchover"));
    expect(h.debug.menuItemRect(h.state(), 1)).toEqual(
      menuItemRect("matchover", 1),
    );
    expect(h.debug.menuItemRect(h.state(), 2)).toBeNull();
  });

  it("returns a snapshot detached from the state", async () => {
    h = await createHarness();
    const snap = h.snap();
    expect(snap.obstacles).not.toBe(h.state().obstacles);
    expect(snap.ball?.trail).not.toBe(h.state().ball?.trail);
    expect(Object.keys(snap).sort()).toEqual(
      [
        "version",
        "screen",
        "mode",
        "menuIndex",
        "titleIndex",
        "resumeScreen",
        "score",
        "winner",
        "muted",
        "paddles",
        "ai",
        "receiver",
        "ball",
        "obstacles",
        "simTime",
      ].sort(),
    );
  });
});
