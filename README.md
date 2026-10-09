# Carom

Carom is a top-down paddle duel that runs entirely in the browser. Two paddles
face each other across a dark field while a ball ricochets between them, off
the top and bottom walls, and off a pair of obstacles in the middle of the
field. A player scores when the ball passes the far edge behind their
opponent's paddle. First to 11 points wins, by a lead of two.

Carom's defining mechanic is spin: the motion of a paddle at the moment it
strikes the ball curves that ball's flight afterward. Spin fades over time but
survives every wall and obstacle bounce, so the two obstacles turn the open
field into a bank-shot puzzle.

Two modes are offered: **Solo**, against an AI opponent, and **Versus**, two
local players sharing one keyboard.

## Controls

| Action                        | Keys                                |
| ----------------------------- | ----------------------------------- |
| Player one (left paddle)      | `W` up, `S` down                    |
| Player two (right paddle)     | `↑` up, `↓` down                    |
| Solo                          | either pair moves your paddle       |
| Confirm a menu item           | `Enter` or `Space`                  |
| Back                          | `Escape`                            |
| Pause and resume              | `P` or `Escape`                     |
| Mute                          | `M`                                 |
| Debug overlay                 | `` ` `` (backtick)                  |

Menus also take the mouse and touch: hovering over an item highlights it, and a
click or tap inside an item selects it. On a touchscreen the engine draws a
vertical slider along each edge of the field for the paddles.

## Install

```sh
npm ci
```

Carom is a TypeScript project built with Vite on the Simple 2D engine, which is
vendored into the repository under `.vendor/` and documented under `engine/`.
The full game specification lives under `specs/`.

## Run in development

```sh
npm run dev
```

Vite serves the game with hot reload and prints the local URL.

## Build for production

```sh
npm run build
```

This type-checks the project and emits the complete static site into `dist/`,
with `index.html` at its root. The directory runs as-is on any static file
server. `npm run preview` serves it locally for a final check.

## Checks and tests

```sh
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run format      # prettier, in check mode
npm test            # vitest, with coverage
```

The tests live beside the sources as `src/**/*.test.ts`. They stand the engine
up headlessly over an `@napi-rs/canvas` canvas, pose scenarios through the
game's debug surface, and step the simulation an exact number of frames, so
they need no browser.

## Project layout

| Path                 | Holds                                                         |
| -------------------- | ------------------------------------------------------------- |
| `src/game.ts`        | The state types, the debug surface type, and the `Game`.      |
| `src/update.ts`      | The frame transition: input, menus, serving, scoring.         |
| `src/physics.ts`     | The ball's sub-stepped physics, collisions, and spin.         |
| `src/ai.ts`          | The Solo opponent.                                            |
| `src/menu.ts`        | The menus' items and hit regions.                             |
| `src/render.ts`      | All drawing.                                                  |
| `src/debug.ts`       | The debug and automation surface.                             |
| `src/harness.ts`     | The headless engine the tests and the tooling drive.          |
| `src/constants.ts`   | Every figure the specification fixes. Supplied; do not edit.  |
| `tools/`             | Showcase capture: screenshots via Playwright, a replay.       |
| `showcase/`          | The store-page description, carousel, and media.              |

## Showcase

`showcase/` carries the store-page description, the carousel manifest, the
screenshots, and a replay recorded with the engine's own recorder. To
regenerate the media:

```sh
npm run build
npx vite preview --port 4173 &
node tools/screenshots.mjs /tmp/shots          # one screenshot per screen
node tools/rally-shots.mjs /tmp/rally 40       # mid-rally frames from real play
node tools/run.mjs tools/capture-replay.ts showcase/rally.json.gz
```
