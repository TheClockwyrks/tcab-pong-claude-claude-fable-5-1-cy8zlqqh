import { afterEach, describe, expect, it } from "vitest";
import {
  FIELD_CX,
  FIELD_CY,
  NET_X,
  OBSTACLE_CENTERS,
  P1_X0,
  P2_X0,
} from "./constants";
import { createHarness } from "./harness";
import type { Harness } from "./harness";
import { menuItemRect } from "./menu";
import { MODE_LABELS, PALETTE, WINNER_LABELS } from "./render";

let h: Harness;
afterEach(() => h.destroy());

/** The pixel at a logical point, as `[r, g, b, a]`, over a 1:1 fit. */
function pixel(x: number, y: number): number[] {
  const ctx = h.canvas.getContext("2d");
  return Array.from(ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data);
}

function hex(color: string): number[] {
  return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
}

function near(actual: number[], expected: number[], tolerance = 40): boolean {
  return expected.every((c, i) => Math.abs(c - (actual[i] ?? 0)) <= tolerance);
}

describe("rendering", () => {
  it("draws the live field: paddles, ball, obstacles, net, and background", async () => {
    h = await createHarness();
    h.pose((d, s) => d.setScreen(s, "playing"));
    await h.advance();
    expect(near(pixel(FIELD_CX, FIELD_CY), hex(PALETTE.ball))).toBe(true);
    expect(near(pixel(P1_X0 + 8, FIELD_CY), hex(PALETTE.left))).toBe(true);
    expect(near(pixel(P2_X0 + 8, FIELD_CY), hex(PALETTE.right))).toBe(true);
    const a = OBSTACLE_CENTERS[0]!;
    expect(near(pixel(a.x, a.y), hex(PALETTE.obstacle))).toBe(true);
    expect(near(pixel(200, 200), hex(PALETTE.field), 12)).toBe(true);
    expect(near(pixel(NET_X, 12), hex(PALETTE.net), 60)).toBe(true);
  });

  it("leaves an absent ball and absent obstacles undrawn", async () => {
    h = await createHarness();
    h.pose((d, s) => d.setScreen(s, "playing"));
    h.pose((d, s) => d.clearWorld(s));
    await h.advance();
    expect(near(pixel(FIELD_CX + 14, FIELD_CY), hex(PALETTE.field), 12)).toBe(
      true,
    );
    const a = OBSTACLE_CENTERS[0]!;
    expect(near(pixel(a.x, a.y), hex(PALETTE.field), 12)).toBe(true);
  });

  it("draws the highlighted menu item distinctly on every menu screen", async () => {
    h = await createHarness();
    for (const screen of ["title", "howto", "paused", "matchover"] as const) {
      h.pose((d, s) => d.setScreen(s, screen));
      h.pose((d, s) => d.setMenuIndex(s, 0));
      await h.advance();
      const rect = menuItemRect(screen, 0)!;
      expect(near(pixel(rect.x + 8, rect.y + 8), hex(PALETTE.highlight))).toBe(
        true,
      );
      const other = menuItemRect(screen, 1);
      if (other !== null) {
        expect(
          near(pixel(other.x + 8, other.y + 8), hex(PALETTE.highlight)),
        ).toBe(false);
      }
    }
  });

  it("draws a trail behind a moving ball", async () => {
    h = await createHarness();
    h.pose((d, s) => d.setScreen(s, "playing"));
    h.pose((d, s) => d.setBallHeld(s, false));
    h.pose((d, s) => d.setBallPosition(s, 300, 500));
    h.pose((d, s) => d.setBallVelocity(s, 600, 0));
    await h.advance(6);
    const ball = h.snap().ball!;
    const behind = pixel(ball.x - 40, ball.y);
    expect(near(behind, hex(PALETTE.field), 12)).toBe(false);
    const ahead = pixel(ball.x + 40, ball.y);
    expect(near(ahead, hex(PALETTE.field), 12)).toBe(true);
  });

  it("records drawing operations for every screen without throwing", async () => {
    h = await createHarness();
    const screens = [
      "title",
      "howto",
      "countdown",
      "playing",
      "paused",
      "matchover",
    ] as const;
    h.engine.startRecording();
    for (const screen of screens) {
      h.pose((d, s) => d.setScreen(s, screen));
      await h.advance();
    }
    h.pose((d, s) => d.setWinner(s, "right"));
    h.pose((d, s) => d.setMode(s, "versus"));
    await h.advance();
    const recording = h.engine.stopRecording();
    expect(recording.frames).toHaveLength(screens.length + 1);
    for (const frame of recording.frames) {
      expect(frame.ops.length).toBeGreaterThan(10);
    }
    const texts = recording.ops
      .filter((op) => op.op === "call" && op.method === "fillText")
      .map((op) => (op.op === "call" ? String(op.args[0]) : ""));
    const drawn = (copy: string): boolean =>
      texts.some((t) => t.includes(copy));
    expect(drawn("CAROM")).toBe(true);
    expect(drawn("SOLO")).toBe(true);
    expect(drawn("VERSUS")).toBe(true);
    expect(drawn("HOW TO PLAY")).toBe(true);
    expect(drawn("RESUME")).toBe(true);
    expect(drawn("PLAY AGAIN")).toBe(true);
    expect(drawn("PAUSED")).toBe(true);
    expect(texts).toContain(WINNER_LABELS.right);
    expect(texts).toContain(MODE_LABELS.solo);
    expect(texts).toContain(MODE_LABELS.versus);
    expect(texts).toContain("0");
  });

  it("names the winner and the final score on the match-over screen", async () => {
    h = await createHarness();
    h.pose((d, s) => d.setScreen(s, "matchover"));
    h.pose((d, s) => d.setWinner(s, "left"));
    h.pose((d, s) => d.setScore(s, 11, 7));
    h.engine.startRecording();
    await h.advance();
    const recording = h.engine.stopRecording();
    const texts = recording.ops
      .filter((op) => op.op === "call" && op.method === "fillText")
      .map((op) => (op.op === "call" ? String(op.args[0]) : ""));
    expect(texts).toContain(WINNER_LABELS.left);
    expect(texts.some((t) => t.includes("11") && t.includes("7"))).toBe(true);
    h.pose((d, s) => d.setWinner(s, null));
    await h.advance();
  });
});
