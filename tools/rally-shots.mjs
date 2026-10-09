// Plays a solo match in headless Chromium by watching the screen, and saves a
// screenshot each time the ball crosses the middle of the field, so a showcase
// picks its live-play view from real rallies:
//
//   npx vite preview --port 4173 &
//   node tools/rally-shots.mjs <outDir> [seconds]
//
// The player reads each frame's pixels for the ball and its own paddle and
// drives the paddle with the keyboard, exactly as a person would.

import console from "node:console";
import process from "node:process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { chromium } from "playwright";

const outDir = process.argv[2] ?? "/tmp/rally-shots";
const seconds = Number(process.argv[3] ?? "40");
const url = process.env["CAROM_URL"] ?? "http://localhost:4173/";

const W = 1280;
const H = 720;

/** Finds the ball (a bright warm pixel) and the cyan paddle's center y. */
async function locate(png) {
  const image = await loadImage(png);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, W, H);
  let ballX = 0;
  let ballY = 0;
  let ballN = 0;
  let paddleY = 0;
  let paddleN = 0;
  for (let y = 100; y < H - 50; y += 2) {
    for (let x = 0; x < W; x += 2) {
      const i = (y * W + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r > 245 && g > 230 && b > 150 && b < 215 && x > 70 && x < 1210) {
        ballX += x;
        ballY += y;
        ballN++;
      } else if (x >= 48 && x <= 64 && r < 120 && g > 190 && b > 240) {
        paddleY += y;
        paddleN++;
      }
    }
  }
  return {
    ball: ballN > 4 ? { x: ballX / ballN, y: ballY / ballN } : null,
    paddleY: paddleN > 0 ? paddleY / paddleN : null,
  };
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));

await page.goto(url);
await page.waitForTimeout(300);
await page.keyboard.press("Enter");

let held = null;
const hold = async (key) => {
  if (held === key) return;
  if (held !== null) await page.keyboard.up(held);
  held = key;
  if (key !== null) await page.keyboard.down(key);
};

let previous = null;
let saved = 0;
let lastSaveAt = 0;
const start = Date.now();
while (Date.now() - start < seconds * 1000) {
  const png = await page.screenshot({ type: "png" });
  const now = Date.now();
  const { ball, paddleY } = await locate(png);
  if (ball !== null && paddleY !== null) {
    let target = ball.y;
    if (previous !== null && ball.x < previous.x) {
      // The ball is coming: lead it by its vertical travel to the paddle.
      const dt = (now - previous.at) / 1000;
      const vx = (ball.x - previous.x) / dt;
      const vy = (ball.y - previous.y) / dt;
      const eta = Math.min(0.6, (ball.x - 75) / Math.max(50, -vx));
      target = ball.y + vy * eta;
    }
    target = Math.max(60, Math.min(660, target));
    const diff = target - paddleY;
    await hold(Math.abs(diff) < 14 ? null : diff > 0 ? "KeyS" : "KeyW");
    previous = { ...ball, at: now };
    if (ball.x > 240 && ball.x < 1040 && now - lastSaveAt > 500) {
      await writeFile(
        join(outDir, `rally-${String(saved).padStart(3, "0")}.png`),
        png,
      );
      saved++;
      lastSaveAt = now;
    }
  } else {
    await hold(null);
    previous = null;
  }
}
await hold(null);
await browser.close();
if (errors.length > 0) {
  console.error("Browser errors:\n" + errors.join("\n"));
  process.exit(1);
}
console.log(`${saved} rally screenshots written to ${outDir}`);
