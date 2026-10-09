import { afterEach, describe, expect, it } from "vitest";
import {
  FIELD_CX,
  FIELD_CY,
  HOLD_TIME,
  PADDLE_MAX_CY,
  PADDLE_SPEED,
  SERVE_ANGLE,
  SERVE_SPEED,
} from "./constants";
import { createHarness } from "./harness";
import type { Harness } from "./harness";

let h: Harness;
afterEach(() => h.destroy());

describe("the title screen", () => {
  it("opens on the title with the state specs/state.md gives it", async () => {
    h = await createHarness();
    const s = h.snap();
    expect(s.screen).toBe("title");
    expect(s.mode).toBe("solo");
    expect(s.menuIndex).toBe(0);
    expect(s.titleIndex).toBe(0);
    expect(s.resumeScreen).toBe("playing");
    expect(s.score).toEqual({ p1: 0, p2: 0 });
    expect(s.winner).toBeNull();
    expect(s.receiver).toBe("left");
    expect(s.paddles.left).toEqual({
      cy: FIELD_CY,
      vy: 0,
      driven: false,
      drivenVy: 0,
    });
    expect(s.ai).toEqual({ tracking: true, movement: true });
    expect(s.ball).toMatchObject({
      x: FIELD_CX,
      y: FIELD_CY,
      vx: 0,
      vy: 0,
      spin: 0,
      held: true,
      holdTimer: HOLD_TIME,
      trail: [],
      speed: 0,
    });
    expect([1, -1]).toContain(s.ball?.serveSign);
    expect(s.obstacles.map((o) => o.index)).toEqual([0, 1]);
    expect(s.simTime).toBe(0);
    expect(s.muted).toBe(false);
  });

  it("moves the highlight with either player's keys, wrapping both ways", async () => {
    h = await createHarness();
    await h.tap("KeyS");
    expect(h.snap().menuIndex).toBe(1);
    await h.tap("ArrowDown");
    expect(h.snap().menuIndex).toBe(2);
    await h.tap("ArrowDown");
    expect(h.snap().menuIndex).toBe(0);
    await h.tap("KeyW");
    expect(h.snap().menuIndex).toBe(2);
    await h.tap("ArrowUp");
    expect(h.snap().menuIndex).toBe(1);
  });

  it("applies up before down and movement before confirm on one frame", async () => {
    h = await createHarness();
    h.keyDown("KeyS");
    h.keyDown("KeyW");
    h.keyDown("Enter");
    await h.advance();
    expect(h.snap().menuIndex).toBe(2);
    expect(h.snap().screen).toBe("title");
  });

  it("ignores back and leaves nothing advancing", async () => {
    h = await createHarness();
    await h.tap("Escape");
    await h.advance(10);
    const s = h.snap();
    expect(s.screen).toBe("title");
    expect(s.ball?.holdTimer).toBe(HOLD_TIME);
    expect(s.simTime).toBeCloseTo((11 * 1000) / 60 / 1000, 6);
  });

  it("starts a solo match from SOLO and remembers the selection", async () => {
    h = await createHarness();
    await h.tap("Enter");
    const s = h.snap();
    expect(s.screen).toBe("countdown");
    expect(s.mode).toBe("solo");
    expect(s.titleIndex).toBe(0);
    expect(s.menuIndex).toBe(0);
    expect(s.resumeScreen).toBe("playing");
    expect(s.ball?.held).toBe(true);
    expect(s.ball?.holdTimer).toBeCloseTo(HOLD_TIME - 1 / 60, 6);
  });

  it("starts a versus match from VERSUS", async () => {
    h = await createHarness();
    await h.tap("KeyS");
    await h.tap("Space");
    expect(h.snap().mode).toBe("versus");
    expect(h.snap().screen).toBe("countdown");
    expect(h.snap().titleIndex).toBe(1);
  });

  it("opens HOW TO PLAY and returns to the title from it", async () => {
    h = await createHarness();
    await h.tap("KeyW");
    await h.tap("Enter");
    expect(h.snap().screen).toBe("howto");
    expect(h.snap().menuIndex).toBe(0);
    expect(h.snap().titleIndex).toBe(2);
    await h.tap("Escape");
    expect(h.snap().screen).toBe("title");
    expect(h.snap().menuIndex).toBe(2);
    await h.tap("Enter");
    await h.tap("Enter");
    expect(h.snap().screen).toBe("title");
  });
});

describe("serving", () => {
  it("serves on the first frame the hold elapses, toward the left at the serve angle", async () => {
    h = await createHarness();
    await h.tap("Enter");
    h.pose((d, s) => d.setBallServeSign(s, -1));
    await h.advance(58);
    expect(h.snap().screen).toBe("countdown");
    expect(h.snap().ball?.x).toBe(FIELD_CX);
    await h.advance(1);
    const s = h.snap();
    expect(s.screen).toBe("playing");
    expect(s.ball?.held).toBe(false);
    expect(s.ball?.holdTimer).toBe(0);
    expect(s.ball?.vx).toBeCloseTo(-SERVE_SPEED * Math.cos(SERVE_ANGLE), 6);
    expect(s.ball?.vy).toBeCloseTo(-SERVE_SPEED * Math.sin(SERVE_ANGLE), 6);
    expect(s.ball?.serveSign).toBe(-1);
    expect(s.ball?.x).toBe(FIELD_CX);
    expect(s.ball?.trail).toHaveLength(1);
    await h.advance(1);
    expect(h.snap().ball?.x).toBeLessThan(FIELD_CX);
  });

  it("takes the serve sign the ball holds at the moment it is served", async () => {
    h = await createHarness();
    h.pose((d, s) => d.setScreen(s, "countdown"));
    h.pose((d, s) => d.setBallServeSign(s, 1));
    h.pose((d, s) => d.setBallHoldTimer(s, 0));
    await h.advance(1);
    expect(h.snap().screen).toBe("playing");
    expect(h.snap().ball?.vy).toBeGreaterThan(0);
  });

  it("moves both paddles during the countdown", async () => {
    h = await createHarness();
    await h.tap("KeyS");
    await h.tap("Enter");
    h.keyDown("KeyS");
    h.keyDown("ArrowUp");
    await h.advance(6);
    h.keyUp("KeyS");
    h.keyUp("ArrowUp");
    const s = h.snap();
    expect(s.screen).toBe("countdown");
    expect(s.paddles.left.cy).toBeCloseTo(
      FIELD_CY + (PADDLE_SPEED * 6) / 60,
      6,
    );
    expect(s.paddles.right.cy).toBeCloseTo(
      FIELD_CY - (PADDLE_SPEED * 6) / 60,
      6,
    );
  });
});

describe("pausing", () => {
  it("opens the pause menu from playing with Escape and resumes with one more", async () => {
    h = await createHarness();
    await h.tap("Enter");
    await h.advance(60);
    expect(h.snap().screen).toBe("playing");
    await h.tap("Escape");
    expect(h.snap().screen).toBe("paused");
    expect(h.snap().resumeScreen).toBe("playing");
    expect(h.snap().menuIndex).toBe(0);
    const frozen = h.snap().ball;
    await h.advance(20);
    expect(h.snap().ball).toEqual(frozen);
    await h.tap("Escape");
    expect(h.snap().screen).toBe("playing");
    await h.advance(1);
    expect(h.snap().ball?.x).not.toBe(frozen?.x);
  });

  it("pauses the countdown with P and resumes into the countdown", async () => {
    h = await createHarness();
    await h.tap("Enter");
    await h.advance(10);
    await h.tap("KeyP");
    expect(h.snap().screen).toBe("paused");
    expect(h.snap().resumeScreen).toBe("countdown");
    const timer = h.snap().ball?.holdTimer;
    await h.advance(5);
    expect(h.snap().ball?.holdTimer).toBe(timer);
    await h.tap("KeyP");
    expect(h.snap().screen).toBe("countdown");
  });

  it("resumes, restarts, and quits from the pause menu", async () => {
    h = await createHarness();
    await h.tap("KeyS");
    await h.tap("Enter");
    await h.advance(70);
    await h.tap("KeyP");
    await h.tap("Enter");
    expect(h.snap().screen).toBe("playing");

    h.pose((d, s) => d.setScore(s, 3, 4));
    await h.tap("KeyP");
    await h.tap("ArrowDown");
    await h.tap("Enter");
    let s = h.snap();
    expect(s.screen).toBe("countdown");
    expect(s.mode).toBe("versus");
    expect(s.score).toEqual({ p1: 0, p2: 0 });
    expect(s.ball?.held).toBe(true);

    await h.tap("KeyP");
    await h.tap("KeyW");
    expect(h.snap().menuIndex).toBe(2);
    await h.tap("Enter");
    s = h.snap();
    expect(s.screen).toBe("title");
    expect(s.menuIndex).toBe(1);
    expect(s.titleIndex).toBe(1);
    expect(s.mode).toBe("solo");
    expect(s.simTime).toBeGreaterThan(0);
  });

  it("reads pause and back before the menu edges on one frame", async () => {
    h = await createHarness();
    await h.tap("Enter");
    await h.tap("KeyP");
    h.keyDown("Escape");
    h.keyDown("KeyS");
    await h.advance();
    expect(h.snap().screen).toBe("countdown");
    expect(h.snap().menuIndex).toBe(0);
  });
});

describe("scoring", () => {
  async function playUntilPoint(): Promise<void> {
    h.pose((d, s) => d.setScreen(s, "playing"));
    h.pose((d, s) => d.setBallHeld(s, false));
    h.pose((d, s) => d.setBallPosition(s, 1200, 100));
    h.pose((d, s) => d.setBallVelocity(s, 900, 0));
    await h.advance(10);
  }

  it("scores for player one when the ball leaves the right edge and serves to the right", async () => {
    h = await createHarness();
    h.pose((d, s) => d.setMode(s, "versus"));
    await playUntilPoint();
    const s = h.snap();
    expect(s.score).toEqual({ p1: 1, p2: 0 });
    expect(s.screen).toBe("countdown");
    expect(s.receiver).toBe("right");
    expect(s.ball).toMatchObject({
      x: FIELD_CX,
      y: FIELD_CY,
      held: true,
      spin: 0,
      vx: 0,
      vy: 0,
    });
    expect(s.ball?.holdTimer).toBeGreaterThan(0);
    expect(s.ball?.holdTimer).toBeLessThanOrEqual(HOLD_TIME);
    expect(h.cues).toContain("score");
  });

  it("scores for player two when the ball leaves the left edge", async () => {
    h = await createHarness();
    h.pose((d, s) => d.setScreen(s, "playing"));
    h.pose((d, s) => d.setBallHeld(s, false));
    h.pose((d, s) => d.setBallPosition(s, 30, FIELD_CY));
    h.pose((d, s) => d.setBallVelocity(s, -900, 0));
    await h.advance(10);
    expect(h.snap().score).toEqual({ p1: 0, p2: 1 });
    expect(h.snap().receiver).toBe("left");
  });

  it("ends the match at 11 with a two-point lead and leaves the ball where it is", async () => {
    h = await createHarness();
    h.pose((d, s) => d.setMode(s, "versus"));
    h.pose((d, s) => d.setScore(s, 10, 9));
    await playUntilPoint();
    const s = h.snap();
    expect(s.screen).toBe("matchover");
    expect(s.score).toEqual({ p1: 11, p2: 9 });
    expect(s.winner).toBe("left");
    expect(s.menuIndex).toBe(0);
    expect(s.ball?.held).toBe(false);
    expect(s.ball?.x).toBeGreaterThan(1200);
    await h.advance(5);
    expect(h.snap().ball?.x).toBe(s.ball?.x);
  });

  it("plays on at deuce until a two-point lead", async () => {
    h = await createHarness();
    h.pose((d, s) => d.setMode(s, "versus"));
    h.pose((d, s) => d.setScore(s, 10, 10));
    await playUntilPoint();
    expect(h.snap().score).toEqual({ p1: 11, p2: 10 });
    expect(h.snap().screen).toBe("countdown");
    await playUntilPoint();
    const s = h.snap();
    expect(s.score).toEqual({ p1: 12, p2: 10 });
    expect(s.screen).toBe("matchover");
    expect(s.winner).toBe("left");
    expect(s.menuIndex).toBe(0);
    expect(s.ball?.x).toBeGreaterThan(1200);
  });

  it("offers PLAY AGAIN and MENU on the match-over screen", async () => {
    h = await createHarness();
    h.pose((d, s) => d.setMode(s, "versus"));
    h.pose((d, s) => d.setScore(s, 0, 10));
    h.pose((d, s) => d.setScreen(s, "playing"));
    h.pose((d, s) => d.setBallPosition(s, 20, FIELD_CY));
    h.pose((d, s) => d.setBallVelocity(s, -900, 0));
    await h.advance(5);
    expect(h.snap().screen).toBe("matchover");
    expect(h.snap().winner).toBe("right");
    await h.tap("ArrowDown");
    await h.tap("ArrowDown");
    expect(h.snap().menuIndex).toBe(0);
    await h.tap("Enter");
    let s = h.snap();
    expect(s.screen).toBe("countdown");
    expect(s.mode).toBe("versus");
    expect(s.winner).toBeNull();
    expect(s.score).toEqual({ p1: 0, p2: 0 });

    h.pose((d, s) => d.setScreen(s, "matchover"));
    h.pose((d, s) => d.setWinner(s, "left"));
    await h.tap("KeyS");
    await h.tap("Enter");
    s = h.snap();
    expect(s.screen).toBe("title");
    expect(s.winner).toBeNull();

    h.pose((d, s) => d.setScreen(s, "matchover"));
    await h.tap("Escape");
    expect(h.snap().screen).toBe("title");
  });
});

describe("the match advancing", () => {
  it("records a trail no older than TRAIL_TIME behind a flying ball", async () => {
    h = await createHarness();
    h.pose((d, s) => d.setScreen(s, "playing"));
    h.pose((d, s) => d.setBallHeld(s, false));
    h.pose((d, s) => d.setBallVelocity(s, 300, 0));
    await h.advance(30);
    const s = h.snap();
    const trail = s.ball?.trail ?? [];
    expect(trail.length).toBeGreaterThan(5);
    expect(trail.length).toBeLessThan(10);
    expect(trail[trail.length - 1]?.t).toBeCloseTo(s.simTime, 9);
    for (let i = 1; i < trail.length; i++) {
      expect(trail[i]!.t).toBeGreaterThan(trail[i - 1]!.t);
      expect(trail[i]!.x).toBeGreaterThan(trail[i - 1]!.x);
    }
  });

  it("lets a solo player move with either pair of keys and pins the paddle at the bound", async () => {
    h = await createHarness();
    await h.tap("Enter");
    h.keyDown("ArrowDown");
    await h.advance(1);
    expect(h.snap().paddles.left.vy).toBe(PADDLE_SPEED);
    await h.advance(40);
    expect(h.snap().paddles.left.cy).toBe(PADDLE_MAX_CY);
    expect(h.snap().paddles.left.vy).toBe(0);
    h.keyUp("ArrowDown");
    await h.advance(1);
    expect(h.snap().paddles.left.vy).toBe(0);
  });

  it("gives each versus player their own keys", async () => {
    h = await createHarness();
    h.pose((d, s) => d.setMode(s, "versus"));
    h.pose((d, s) => d.setScreen(s, "playing"));
    h.keyDown("KeyW");
    h.keyDown("ArrowDown");
    await h.advance(3);
    const s = h.snap();
    expect(s.paddles.left.cy).toBeLessThan(FIELD_CY);
    expect(s.paddles.right.cy).toBeGreaterThan(FIELD_CY);
    h.keyUp("KeyW");
    h.keyUp("ArrowDown");
    h.keyDown("ArrowUp");
    await h.advance(3);
    expect(h.snap().paddles.left.cy).toBe(s.paddles.left.cy);
    expect(h.snap().paddles.right.cy).toBeLessThan(s.paddles.right.cy);
  });

  it("leaves an absent ball out of the frame", async () => {
    h = await createHarness();
    h.pose((d, s) => d.clearWorld(s));
    h.pose((d, s) => d.setScreen(s, "countdown"));
    await h.advance(120);
    expect(h.snap().screen).toBe("countdown");
    expect(h.snap().ball).toBeNull();
    h.pose((d, s) => d.setScreen(s, "playing"));
    await h.advance(10);
    expect(h.snap().score).toEqual({ p1: 0, p2: 0 });
    expect(h.cues).toEqual([]);
  });
});

describe("muting", () => {
  it("toggles the bus with M on any screen and mirrors it into the state", async () => {
    h = await createHarness();
    await h.tap("KeyM");
    expect(h.snap().muted).toBe(true);
    await h.tap("Enter");
    await h.tap("KeyM");
    expect(h.snap().muted).toBe(false);
    await h.tap("KeyM");
    expect(h.snap().muted).toBe(true);
    h.pose((d, s) => d.setScreen(s, "playing"));
    h.pose((d, s) => d.setBallHeld(s, false));
    h.pose((d, s) => d.setBallPosition(s, 1200, 100));
    h.pose((d, s) => d.setBallVelocity(s, 900, 0));
    await h.advance(10);
    expect(h.cues).toContain("score");
    expect(h.snap().score.p1).toBe(1);
  });

  it("sets the bus from the setMuted pose and keeps it across a reset", async () => {
    h = await createHarness();
    h.pose((d, s) => d.setMuted(s, true));
    expect(h.snap().muted).toBe(true);
    await h.advance(1);
    expect(h.snap().muted).toBe(true);
    await h.tap("KeyM");
    expect(h.snap().muted).toBe(false);
    h.pose((d, s) => d.setMuted(s, true));
    h.pose((d, s) => d.reset(s));
    expect(h.snap().muted).toBe(true);
  });
});
