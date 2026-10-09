import { afterEach, describe, expect, it } from "vitest";
import { createHarness } from "./harness";
import type { Harness } from "./harness";
import { menuItemRect } from "./menu";
import type { Screen } from "./game";

let h: Harness;
afterEach(() => h.destroy());

function center(screen: Screen, index: number): { x: number; y: number } {
  const rect = menuItemRect(screen, index)!;
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

describe("pointer and touch over the menus", () => {
  it("selects the item a pointer moves onto", async () => {
    h = await createHarness();
    const two = center("title", 2);
    h.pointerMove(two.x, two.y);
    await h.advance();
    expect(h.snap().menuIndex).toBe(2);
    h.pointerMove(5, 5);
    await h.advance();
    expect(h.snap().menuIndex).toBe(2);
  });

  it("confirms an item pressed and released inside it, across frames", async () => {
    h = await createHarness();
    const one = center("title", 1);
    h.pointerDown(one.x, one.y);
    await h.advance(3);
    expect(h.snap().menuIndex).toBe(1);
    expect(h.snap().screen).toBe("title");
    h.pointerUp(one.x + 20, one.y + 5);
    await h.advance();
    expect(h.snap().screen).toBe("countdown");
    expect(h.snap().mode).toBe("versus");
    expect(h.snap().titleIndex).toBe(1);
  });

  it("confirms a press and release that arrive on one frame", async () => {
    h = await createHarness();
    const zero = center("title", 0);
    h.pointerDown(zero.x, zero.y);
    h.pointerUp(zero.x, zero.y);
    await h.advance();
    expect(h.snap().screen).toBe("countdown");
    expect(h.snap().mode).toBe("solo");
  });

  it("confirms nothing when the edges fall in different regions or outside", async () => {
    h = await createHarness();
    const zero = center("title", 0);
    const one = center("title", 1);
    h.pointerDown(zero.x, zero.y);
    await h.advance();
    h.pointerMove(one.x, one.y);
    h.pointerUp(one.x, one.y);
    await h.advance();
    expect(h.snap().screen).toBe("title");
    expect(h.snap().menuIndex).toBe(1);

    h.pointerDown(10, 10);
    await h.advance();
    h.pointerUp(one.x, one.y);
    await h.advance();
    expect(h.snap().screen).toBe("title");

    h.pointerDown(one.x, one.y);
    await h.advance();
    h.pointerUp(10, 10);
    await h.advance();
    expect(h.snap().screen).toBe("title");

    // A stale press confirms nothing on a later release.
    h.pointerUp(one.x, one.y);
    await h.advance();
    expect(h.snap().screen).toBe("title");
  });

  it("selects on a touch landing or travelling onto an item and confirms on the lift", async () => {
    h = await createHarness();
    const touch = { device: "touch" as const, id: 11 };
    const zero = center("title", 0);
    const two = center("title", 2);
    h.pointerDown(zero.x, zero.y, touch);
    await h.advance();
    expect(h.snap().menuIndex).toBe(0);
    h.pointerMove(two.x, two.y, touch);
    await h.advance();
    expect(h.snap().menuIndex).toBe(2);
    h.pointerUp(two.x, two.y, touch);
    await h.advance();
    expect(h.snap().screen).toBe("title");

    h.pointerDown(two.x, two.y, touch);
    h.pointerUp(two.x, two.y, touch);
    await h.advance();
    expect(h.snap().screen).toBe("howto");
    expect(h.snap().titleIndex).toBe(2);
  });

  it("does not confirm a lift from a different contact than the one that landed", async () => {
    h = await createHarness();
    const one = center("title", 1);
    h.pointerDown(one.x, one.y, { device: "touch", id: 3 });
    await h.advance();
    h.pointerUp(one.x, one.y, { device: "touch", id: 4, primary: false });
    await h.advance();
    expect(h.snap().screen).toBe("title");
  });

  it("lets the pointer name the item over a keyboard move, and the keyboard confirm win", async () => {
    h = await createHarness();
    const two = center("title", 2);
    h.keyDown("KeyS");
    h.pointerMove(two.x, two.y);
    await h.advance();
    h.keyUp("KeyS");
    expect(h.snap().menuIndex).toBe(2);

    h.pose((d, s) => d.setMenuIndex(s, 0));
    const one = center("title", 1);
    h.keyDown("Enter");
    h.pointerDown(one.x, one.y);
    h.pointerUp(one.x, one.y);
    await h.advance();
    h.keyUp("Enter");
    expect(h.snap().screen).toBe("countdown");
    expect(h.snap().mode).toBe("solo");
  });

  it("drives the pause and match-over menus too", async () => {
    h = await createHarness();
    await h.tap("Enter");
    await h.tap("KeyP");
    const quit = center("paused", 2);
    h.pointerDown(quit.x, quit.y);
    h.pointerUp(quit.x, quit.y);
    await h.advance();
    expect(h.snap().screen).toBe("title");

    h.pose((d, s) => d.setScreen(s, "matchover"));
    const again = center("matchover", 0);
    h.pointerMove(again.x, again.y);
    await h.advance();
    expect(h.snap().menuIndex).toBe(0);
    h.pointerDown(again.x, again.y);
    h.pointerUp(again.x, again.y);
    await h.advance();
    expect(h.snap().screen).toBe("countdown");
  });

  it("maps a pointer through a letterboxed, scaled fit", async () => {
    h = await createHarness({ cssWidth: 640, cssHeight: 480, dpr: 2 });
    // The 1280x720 field fits 640x480 at scale 0.5: 640x360, letterboxed 60 top.
    const one = center("title", 1);
    h.pointerMove(one.x / 2, one.y / 2 + 60);
    await h.advance();
    expect(h.snap().menuIndex).toBe(1);
  });

  it("ignores pointer input during play", async () => {
    h = await createHarness();
    h.pose((d, s) => d.setScreen(s, "playing"));
    h.pointerDown(640, 360);
    h.pointerUp(640, 360);
    await h.advance();
    expect(h.snap().screen).toBe("playing");
    expect(h.snap().menuIndex).toBe(0);
  });
});
