import { describe, expect, it, vi } from "vitest";
import { FIELD_CY, HOLD_TIME } from "./constants";
import {
  allObstacles,
  drawServeSign,
  obstacleAt,
  parkedBall,
  returnToTitle,
  startMatch,
  titleState,
} from "./state";

describe("state helpers", () => {
  it("draws each serve sign with equal probability", () => {
    const random = vi.spyOn(Math, "random");
    random.mockReturnValue(0.49);
    expect(drawServeSign()).toBe(1);
    random.mockReturnValue(0.5);
    expect(drawServeSign()).toBe(-1);
    random.mockRestore();
    const draws = new Set(Array.from({ length: 200 }, drawServeSign));
    expect(draws).toEqual(new Set([1, -1]));
  });

  it("parks the ball at home with a fresh hold", () => {
    expect(parkedBall()).toMatchObject({
      x: 640,
      y: 360,
      vx: 0,
      vy: 0,
      spin: 0,
      held: true,
      holdTimer: HOLD_TIME,
      trail: [],
    });
  });

  it("places obstacles by index and refuses others", () => {
    expect(obstacleAt(0)).toEqual({ index: 0, cx: 490, cy: 220 });
    expect(allObstacles().map((o) => o.index)).toEqual([0, 1]);
    expect(() => obstacleAt(5)).toThrow(/obstacle/);
  });

  it("starts a match keeping the driven flags and the AI faculties", () => {
    const base = {
      ...titleState(true),
      titleIndex: 2,
      simTime: 9,
      ai: { tracking: false, movement: true },
      paddles: {
        left: { cy: 100, vy: 5, driven: true, drivenVy: 50 },
        right: { cy: 600, vy: -5, driven: false, drivenVy: 0 },
      },
      score: { p1: 3, p2: 4 },
      winner: "left" as const,
    };
    const match = startMatch(base, "versus");
    expect(match.screen).toBe("countdown");
    expect(match.mode).toBe("versus");
    expect(match.titleIndex).toBe(2);
    expect(match.simTime).toBe(9);
    expect(match.muted).toBe(true);
    expect(match.score).toEqual({ p1: 0, p2: 0 });
    expect(match.winner).toBeNull();
    expect(match.receiver).toBe("left");
    expect(match.paddles.left).toEqual({
      cy: FIELD_CY,
      vy: 0,
      driven: true,
      drivenVy: 50,
    });
    expect(match.paddles.right.cy).toBe(FIELD_CY);
    expect(match.ai).toEqual({ tracking: false, movement: true });
  });

  it("returns to the title keeping titleIndex, simTime, and muted", () => {
    const base = {
      ...titleState(true),
      screen: "paused" as const,
      mode: "versus" as const,
      titleIndex: 1,
      menuIndex: 2,
      simTime: 4.5,
      score: { p1: 3, p2: 4 },
    };
    const title = returnToTitle(base);
    expect(title.screen).toBe("title");
    expect(title.mode).toBe("solo");
    expect(title.menuIndex).toBe(1);
    expect(title.titleIndex).toBe(1);
    expect(title.simTime).toBe(4.5);
    expect(title.muted).toBe(true);
    expect(title.score).toEqual({ p1: 0, p2: 0 });
  });
});
