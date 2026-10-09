// Carom — drawing (specs/overview.md, specs/ui.md).
//
// Everything is drawn in the field's logical units through the context the
// engine hands over, which already carries the viewport transform. Nothing here
// reads input, plays a cue, or changes the state.

import type { DeepReadonly } from "ts-essentials";
import {
  BALL_R,
  BINDINGS,
  FIELD_CX,
  FIELD_CY,
  FIELD_H,
  FIELD_W,
  HOLD_TIME,
  NET_X,
  OBSTACLE_H,
  OBSTACLE_W,
  P1_X0,
  P2_X0,
  PADDLE_H,
  PADDLE_W,
  TITLE_TEXT,
  TRAIL_TIME,
} from "./constants";
import type { ActionName } from "./constants";
import type { CaromState, Screen, Side } from "./game";
import { menuItemRect, menuItems } from "./menu";

type Ctx = CanvasRenderingContext2D;
type S = DeepReadonly<CaromState>;

// ---- Palette ------------------------------------------------------------------

export const PALETTE = {
  field: "#0b0e1a",
  line: "#273052",
  net: "#3a4470",
  text: "#e8ecff",
  dim: "#8a93b8",
  left: "#4fd6ff",
  right: "#ff8a5c",
  ball: "#fff3b0",
  obstacle: "#b48cff",
  highlight: "#ffd166",
  overlay: "rgba(6, 8, 18, 0.72)",
} as const;

const FONT = '"Trebuchet MS", "Segoe UI", Helvetica, Arial, sans-serif';

function font(size: number, weight = "bold"): string {
  return `${weight} ${size}px ${FONT}`;
}

/** The copy the mode label shows for each mode. */
export const MODE_LABELS = {
  solo: "SOLO — YOU VS THE MACHINE",
  versus: "VERSUS — TWO PLAYERS",
} as const;

/** The copy the match-over screen names each winner by. */
export const WINNER_LABELS: Readonly<Record<Side, string>> = {
  left: "PLAYER ONE WINS",
  right: "PLAYER TWO WINS",
};

// ---- Primitives -----------------------------------------------------------------

function roundedRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function glowRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  roundedRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();
}

function text(
  ctx: Ctx,
  copy: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = "center",
  weight = "bold",
): void {
  ctx.font = font(size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(copy, x, y);
}

// ---- The field -------------------------------------------------------------------

function drawField(ctx: Ctx): void {
  ctx.strokeStyle = PALETTE.line;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, FIELD_W - 2, FIELD_H - 2);

  ctx.save();
  ctx.strokeStyle = PALETTE.net;
  ctx.lineWidth = 4;
  ctx.setLineDash([18, 16]);
  ctx.beginPath();
  ctx.moveTo(NET_X, 8);
  ctx.lineTo(NET_X, FIELD_H - 8);
  ctx.stroke();
  ctx.restore();
}

function drawPaddles(state: S): (ctx: Ctx) => void {
  return (ctx) => {
    glowRect(
      ctx,
      P1_X0,
      state.paddles.left.cy - PADDLE_H / 2,
      PADDLE_W,
      PADDLE_H,
      7,
      PALETTE.left,
    );
    glowRect(
      ctx,
      P2_X0,
      state.paddles.right.cy - PADDLE_H / 2,
      PADDLE_W,
      PADDLE_H,
      7,
      PALETTE.right,
    );
  };
}

function drawObstacles(ctx: Ctx, state: S): void {
  for (const obstacle of state.obstacles) {
    glowRect(
      ctx,
      obstacle.cx - OBSTACLE_W / 2,
      obstacle.cy - OBSTACLE_H / 2,
      OBSTACLE_W,
      OBSTACLE_H,
      9,
      PALETTE.obstacle,
    );
  }
}

/** The ball's path over the last `TRAIL_TIME` seconds, fading toward its tail. */
function drawTrail(ctx: Ctx, state: S): void {
  const ball = state.ball;
  if (ball === null || ball.trail.length < 2) return;
  const now = state.simTime;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 1; i < ball.trail.length; i++) {
    const from = ball.trail[i - 1];
    const to = ball.trail[i];
    if (from === undefined || to === undefined) continue;
    const age = Math.min(1, Math.max(0, (now - to.t) / TRAIL_TIME));
    const strength = 1 - age;
    ctx.strokeStyle = `rgba(255, 243, 176, ${(0.55 * strength).toFixed(3)})`;
    ctx.lineWidth = 2 + strength * (BALL_R * 1.6);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBall(ctx: Ctx, state: S): void {
  const ball = state.ball;
  if (ball === null) return;
  ctx.save();
  ctx.shadowColor = PALETTE.ball;
  ctx.shadowBlur = 22;
  ctx.fillStyle = PALETTE.ball;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawScores(ctx: Ctx, state: S): void {
  text(ctx, String(state.score.p1), FIELD_CX - 110, 70, 72, PALETTE.left);
  text(ctx, String(state.score.p2), FIELD_CX + 110, 70, 72, PALETTE.right);
  text(ctx, MODE_LABELS[state.mode], FIELD_CX, FIELD_H - 26, 16, PALETTE.dim);
}

/** The pre-serve hold: a ring draining around the ball, and the receiver's cue. */
function drawCountdown(ctx: Ctx, state: S): void {
  const ball = state.ball;
  if (ball === null) return;
  const remaining = Math.max(0, Math.min(1, ball.holdTimer / HOLD_TIME));
  ctx.save();
  ctx.strokeStyle = PALETTE.highlight;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(
    ball.x,
    ball.y,
    BALL_R + 16,
    -Math.PI / 2,
    -Math.PI / 2 + Math.PI * 2 * remaining,
  );
  ctx.stroke();
  ctx.restore();
  const chevron = state.receiver === "left" ? "◀" : "▶";
  const dx = state.receiver === "left" ? -62 : 62;
  text(ctx, chevron, FIELD_CX + dx, FIELD_CY, 28, PALETTE.highlight);
  text(ctx, "SERVE", FIELD_CX, FIELD_CY - 64, 24, PALETTE.highlight);
}

function drawLiveField(ctx: Ctx, state: S): void {
  drawField(ctx);
  drawObstacles(ctx, state);
  drawTrail(ctx, state);
  drawPaddles(state)(ctx);
  drawBall(ctx, state);
  drawScores(ctx, state);
}

// ---- Menus ------------------------------------------------------------------------

function drawMenu(ctx: Ctx, screen: Screen, menuIndex: number): void {
  const items = menuItems(screen);
  items.forEach((item, index) => {
    const rect = menuItemRect(screen, index);
    if (rect === null) return;
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    if (index === menuIndex) {
      ctx.save();
      ctx.shadowColor = PALETTE.highlight;
      ctx.shadowBlur = 16;
      ctx.fillStyle = PALETTE.highlight;
      roundedRect(ctx, rect.x, rect.y, rect.w, rect.h, 12);
      ctx.fill();
      ctx.restore();
      text(ctx, `▶  ${item}`, cx, cy, 26, PALETTE.field);
    } else {
      ctx.strokeStyle = PALETTE.line;
      ctx.lineWidth = 2;
      roundedRect(ctx, rect.x, rect.y, rect.w, rect.h, 12);
      ctx.stroke();
      text(ctx, item, cx, cy, 26, PALETTE.text);
    }
  });
}

function keysOf(action: ActionName): string {
  return BINDINGS[action]
    .map((code) => code.replace(/^Key|^Arrow/, ""))
    .join(" / ");
}

function drawTitle(ctx: Ctx, state: S): void {
  ctx.save();
  ctx.globalAlpha = 0.22;
  drawField(ctx);
  drawObstacles(ctx, state);
  drawPaddles(state)(ctx);
  drawBall(ctx, state);
  ctx.restore();

  ctx.save();
  ctx.shadowColor = PALETTE.left;
  ctx.shadowBlur = 30;
  text(ctx, TITLE_TEXT, FIELD_CX, 190, 128, PALETTE.text);
  ctx.restore();
  text(
    ctx,
    "A TOP-DOWN PADDLE DUEL · SPIN IT · BANK IT",
    FIELD_CX,
    272,
    20,
    PALETTE.dim,
  );
  drawMenu(ctx, "title", state.menuIndex);
  text(
    ctx,
    `${keysOf("p1-up")}/${keysOf("p1-down")} or ${keysOf("p2-up")}/${keysOf("p2-down")} to choose · ${keysOf("confirm")} to select · ${keysOf("mute")} mutes`,
    FIELD_CX,
    FIELD_H - 36,
    16,
    PALETTE.dim,
  );
}

function drawHowTo(ctx: Ctx, state: S): void {
  text(ctx, "HOW TO PLAY", FIELD_CX, 70, 48, PALETTE.text);

  const left = 120;
  const right = FIELD_CX + 60;
  const lines: readonly [string, string, string, number][] = [
    ["CONTROLS", "", PALETTE.highlight, 140],
    [
      "Player one (left paddle)",
      `${keysOf("p1-up")} up · ${keysOf("p1-down")} down`,
      PALETTE.left,
      182,
    ],
    [
      "Player two (right paddle)",
      `${keysOf("p2-up")} up · ${keysOf("p2-down")} down`,
      PALETTE.right,
      216,
    ],
    [
      "Solo",
      "either pair moves your paddle; the AI takes the right",
      PALETTE.text,
      250,
    ],
    ["Pause", `${keysOf("pause")}`, PALETTE.text, 284],
    ["Mute", keysOf("mute"), PALETTE.text, 318],
    ["SPIN", "", PALETTE.highlight, 384],
    [
      "Strike on the move",
      "a paddle moving as it hits curves the ball's flight",
      PALETTE.text,
      426,
    ],
    [
      "Moving down bends it one way, up the other",
      "spin fades over time but survives every bounce",
      PALETTE.text,
      460,
    ],
    ["OBSTACLES", "", PALETTE.highlight, 526],
    [
      "Two bars stand in the field",
      "bank the ball off them for shots a straight line can't reach",
      PALETTE.text,
      568,
    ],
  ];
  for (const [label, detail, color, y] of lines) {
    const isHeading = detail === "";
    text(ctx, label, left, y, isHeading ? 22 : 20, color, "left");
    if (!isHeading)
      text(ctx, detail, right, y, 18, PALETTE.dim, "left", "normal");
  }
  text(
    ctx,
    "First to 11, win by 2.",
    FIELD_CX,
    600,
    18,
    PALETTE.dim,
    "center",
    "normal",
  );
  drawMenu(ctx, "howto", state.menuIndex);
}

function drawOverlay(ctx: Ctx): void {
  ctx.fillStyle = PALETTE.overlay;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
}

function drawPaused(ctx: Ctx, state: S): void {
  drawLiveField(ctx, state);
  drawOverlay(ctx);
  text(ctx, "PAUSED", FIELD_CX, 230, 64, PALETTE.text);
  drawMenu(ctx, "paused", state.menuIndex);
}

function drawMatchOver(ctx: Ctx, state: S): void {
  drawLiveField(ctx, state);
  drawOverlay(ctx);
  const winner = state.winner;
  const label = winner === null ? "MATCH OVER" : WINNER_LABELS[winner];
  const color =
    winner === null
      ? PALETTE.text
      : winner === "left"
        ? PALETTE.left
        : PALETTE.right;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 24;
  text(ctx, label, FIELD_CX, 240, 64, color);
  ctx.restore();
  text(
    ctx,
    `${state.score.p1}  —  ${state.score.p2}`,
    FIELD_CX,
    330,
    48,
    PALETTE.text,
  );
  drawMenu(ctx, "matchover", state.menuIndex);
}

// ---- Entry ----------------------------------------------------------------------------

export function renderGame(state: S, ctx: Ctx): void {
  switch (state.screen) {
    case "title":
      drawTitle(ctx, state);
      break;
    case "howto":
      drawHowTo(ctx, state);
      break;
    case "countdown":
      drawLiveField(ctx, state);
      drawCountdown(ctx, state);
      break;
    case "playing":
      drawLiveField(ctx, state);
      break;
    case "paused":
      drawPaused(ctx, state);
      break;
    case "matchover":
      drawMatchOver(ctx, state);
      break;
  }
}
