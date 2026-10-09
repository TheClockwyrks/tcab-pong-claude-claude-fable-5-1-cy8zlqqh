import { describe, expect, it } from "vitest";
import { MATCHOVER_ITEMS, PAUSE_ITEMS, TITLE_ITEMS } from "./constants";
import { HOWTO_ITEMS, menuItemAt, menuItemRect, menuItems } from "./menu";

describe("menuItems", () => {
  it("names each screen's items in the spec's order", () => {
    expect(menuItems("title")).toEqual(TITLE_ITEMS);
    expect(menuItems("paused")).toEqual(PAUSE_ITEMS);
    expect(menuItems("matchover")).toEqual(MATCHOVER_ITEMS);
    expect(menuItems("howto")).toEqual(HOWTO_ITEMS);
    expect(menuItems("countdown")).toEqual([]);
    expect(menuItems("playing")).toEqual([]);
  });
});

describe("menuItemRect", () => {
  it("lays the items out as non-overlapping regions inside the field", () => {
    for (const screen of ["title", "paused", "matchover", "howto"] as const) {
      const rects = menuItems(screen).map((_, i) => menuItemRect(screen, i)!);
      for (const [i, rect] of rects.entries()) {
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.w).toBeLessThanOrEqual(1280);
        expect(rect.y + rect.h).toBeLessThanOrEqual(720);
        const previous = rects[i - 1];
        if (previous)
          expect(rect.y).toBeGreaterThanOrEqual(previous.y + previous.h);
      }
    }
  });

  it("returns null off the menus and past the last item", () => {
    expect(menuItemRect("countdown", 0)).toBeNull();
    expect(menuItemRect("playing", 0)).toBeNull();
    expect(menuItemRect("title", 3)).toBeNull();
    expect(menuItemRect("title", -1)).toBeNull();
    expect(menuItemRect("title", 1.5)).toBeNull();
    expect(menuItemRect("howto", 1)).toBeNull();
    expect(menuItemRect("matchover", 2)).toBeNull();
  });
});

describe("menuItemAt", () => {
  it("finds the item under a point and null between items", () => {
    const first = menuItemRect("title", 0)!;
    const second = menuItemRect("title", 1)!;
    expect(menuItemAt("title", first.x + 1, first.y + 1)).toBe(0);
    expect(
      menuItemAt("title", first.x + first.w - 1, first.y + first.h - 1),
    ).toBe(0);
    expect(menuItemAt("title", first.x + first.w, first.y)).toBeNull();
    expect(menuItemAt("title", second.x + 10, second.y + 10)).toBe(1);
    expect(menuItemAt("title", 5, 5)).toBeNull();
    expect(menuItemAt("playing", 640, 360)).toBeNull();
  });
});
