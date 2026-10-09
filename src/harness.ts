// Carom — a headless engine for the tests and the capture tooling.
//
// The engine is stood up over an `@napi-rs/canvas` canvas and a surface of the
// harness's own, with a clock that supplies its own deltas, so a scenario is
// posed through the debug surface, driven through synthetic key and pointer
// events, stepped an exact number of frames, and read back from the state.

import { createCanvas } from "@napi-rs/canvas";
import type { Canvas } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import type { Clock, Engine, SurfaceMetrics } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { FIELD_H, FIELD_W, LAYOUT } from "./constants";
import { BACKGROUND, game } from "./game";
import type { CaromDebugApi, CaromState, Snapshot } from "./game";

export interface PointerOptions {
  readonly id?: number;
  readonly device?: "mouse" | "pen" | "touch";
  readonly primary?: boolean;
}

export interface Harness {
  readonly engine: Engine<CaromState, CaromDebugApi>;
  readonly debug: CaromDebugApi;
  readonly canvas: Canvas;
  readonly target: EventTarget;
  /** Every cue played since the harness was built, in order. */
  readonly cues: string[];
  readonly state: () => DeepReadonly<CaromState>;
  readonly snap: () => Snapshot;
  readonly pose: (
    transition: (
      debug: CaromDebugApi,
      state: DeepReadonly<CaromState>,
    ) => CaromState,
  ) => DeepReadonly<CaromState>;
  readonly advance: (frames?: number) => Promise<void>;
  readonly keyDown: (code: string) => void;
  readonly keyUp: (code: string) => void;
  /** A press held for one frame: down, a frame, up. */
  readonly tap: (code: string) => Promise<void>;
  readonly pointerDown: (x: number, y: number, o?: PointerOptions) => void;
  readonly pointerMove: (x: number, y: number, o?: PointerOptions) => void;
  readonly pointerUp: (x: number, y: number, o?: PointerOptions) => void;
  readonly destroy: () => void;
}

export interface HarnessOptions {
  /** Each frame's delta in milliseconds; `1000 / 60` by default. */
  readonly stepMs?: number;
  readonly clock?: Clock;
  readonly cssWidth?: number;
  readonly cssHeight?: number;
  readonly dpr?: number;
}

/** A keyboard event the engine's listener reads, from any realm. */
function keyEvent(type: "keydown" | "keyup", code: string): Event {
  return Object.assign(new Event(type), { code, repeat: false });
}

export async function createHarness(
  options: HarnessOptions = {},
): Promise<Harness> {
  const cssWidth = options.cssWidth ?? FIELD_W;
  const cssHeight = options.cssHeight ?? FIELD_H;
  const dpr = options.dpr ?? 1;
  const canvas = createCanvas(cssWidth * dpr, cssHeight * dpr);
  const target = new EventTarget();
  const surface: SurfaceMetrics = {
    cssWidth: () => cssWidth,
    cssHeight: () => cssHeight,
    dpr: () => dpr,
    events: () => target,
  };
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: FIELD_W,
    height: FIELD_H,
    game,
    background: BACKGROUND,
    layout: LAYOUT,
    surface,
    clock: options.clock ?? new ConstantClock(options.stepMs ?? 1000 / 60),
  });
  const cues: string[] = [];
  engine.events.on("cue:played", (event) => cues.push(event.cue));
  await engine.initialize();
  const debug = engine.debug;

  const pointer = (
    type: "pointerdown" | "pointermove" | "pointerup",
    x: number,
    y: number,
    o: PointerOptions = {},
  ): void => {
    const device = o.device ?? "mouse";
    const down = type !== "pointerup";
    target.dispatchEvent(
      Object.assign(new Event(type), {
        clientX: x,
        clientY: y,
        pointerId: o.id ?? (device === "touch" ? 7 : 1),
        pointerType: device,
        isPrimary: o.primary ?? true,
        button: type === "pointermove" ? -1 : 0,
        buttons:
          type === "pointermove" && device === "mouse" ? 0 : down ? 1 : 0,
      }),
    );
  };

  return {
    engine,
    debug,
    canvas,
    target,
    cues,
    state: () => engine.state,
    snap: () => debug.snapshot(engine.state),
    pose: (transition) => engine.apply((s) => transition(debug, s)),
    advance: (frames = 1) => engine.advance(frames),
    keyDown: (code) => target.dispatchEvent(keyEvent("keydown", code)),
    keyUp: (code) => target.dispatchEvent(keyEvent("keyup", code)),
    tap: async (code) => {
      target.dispatchEvent(keyEvent("keydown", code));
      await engine.advance(1);
      target.dispatchEvent(keyEvent("keyup", code));
    },
    pointerDown: (x, y, o) => pointer("pointerdown", x, y, o),
    pointerMove: (x, y, o) => pointer("pointermove", x, y, o),
    pointerUp: (x, y, o) => pointer("pointerup", x, y, o),
    destroy: () => engine.destroy(),
  };
}
