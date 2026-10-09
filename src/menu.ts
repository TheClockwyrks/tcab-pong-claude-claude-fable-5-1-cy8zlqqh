// Carom — the menus: which items each screen shows and where each one sits.
//
// The layout here is what both the renderer draws and the debug surface
// reports, so a pointer test and the picture agree on every region.

import {
  FIELD_CX,
  MATCHOVER_ITEMS,
  PAUSE_ITEMS,
  TITLE_ITEMS,
} from "./constants";
import type { Screen } from "./game";

/** A menu item's hit region, in logical units. */
export interface MenuItemRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The copy of the how-to screen's single item. */
export const HOWTO_ITEMS = ["BACK"] as const;

export const MENU_ITEM_W = 380;
export const MENU_ITEM_H = 58;

/** The y of the first item on each menu, and the spacing between items. */
const MENU_TOP: Readonly<Partial<Record<Screen, number>>> = {
  title: 372,
  howto: 626,
  paused: 318,
  matchover: 448,
};
const MENU_GAP = 70;

/** The items the menu on `screen` shows, in order, or none for the live field. */
export function menuItems(screen: Screen): readonly string[] {
  switch (screen) {
    case "title":
      return TITLE_ITEMS;
    case "howto":
      return HOWTO_ITEMS;
    case "paused":
      return PAUSE_ITEMS;
    case "matchover":
      return MATCHOVER_ITEMS;
    case "countdown":
    case "playing":
      return [];
  }
}

/** The region item `index` of the menu on `screen` occupies, or `null`. */
export function menuItemRect(
  screen: Screen,
  index: number,
): MenuItemRect | null {
  const top = MENU_TOP[screen];
  const count = menuItems(screen).length;
  if (top === undefined || !Number.isInteger(index) || index < 0) return null;
  if (index >= count) return null;
  return {
    x: FIELD_CX - MENU_ITEM_W / 2,
    y: top + index * MENU_GAP,
    w: MENU_ITEM_W,
    h: MENU_ITEM_H,
  };
}

/** The index of the item on `screen` whose region holds `(x, y)`, or `null`. */
export function menuItemAt(
  screen: Screen,
  x: number,
  y: number,
): number | null {
  const count = menuItems(screen).length;
  for (let index = 0; index < count; index++) {
    const rect = menuItemRect(screen, index);
    if (
      rect !== null &&
      x >= rect.x &&
      x < rect.x + rect.w &&
      y >= rect.y &&
      y < rect.y + rect.h
    ) {
      return index;
    }
  }
  return null;
}
