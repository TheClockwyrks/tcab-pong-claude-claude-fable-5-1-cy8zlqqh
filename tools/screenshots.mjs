// Drives the built site in headless Chromium and screenshots each screen.
//
//   npx vite preview --port 4173 &
//   node tools/screenshots.mjs <outDir>
//
// Chromium runs without a sandbox because this container offers none.

import console from "node:console";
import process from "node:process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const outDir = process.argv[2] ?? "showcase";
const url = process.env["CAROM_URL"] ?? "http://localhost:4173/";

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const shot = (name) => page.screenshot({ path: join(outDir, `${name}.png`) });
const wait = (ms) => page.waitForTimeout(ms);
const hold = async (key, ms) => {
  await page.keyboard.down(key);
  await wait(ms);
  await page.keyboard.up(key);
};

await page.goto(url);
await wait(400);
await shot("title");

await page.keyboard.press("ArrowUp");
await page.keyboard.press("Enter");
await wait(300);
await shot("howto");
await page.keyboard.press("Escape");
await wait(200);

// The title remembers HOW TO PLAY, so step down to SOLO (wrapping) and start.
await page.keyboard.press("ArrowDown");
await wait(100);
await page.keyboard.press("Enter");
await wait(200);
await shot("countdown");
await wait(1300);
await hold("KeyS", 260);
await hold("KeyW", 420);
for (let i = 0; i < 12; i++) {
  await wait(220);
  await shot(`rally-${String(i).padStart(2, "0")}`);
  if (i % 3 === 0) await hold("KeyW", 180);
  if (i % 3 === 2) await hold("KeyS", 240);
}

await page.keyboard.press("KeyP");
await wait(200);
await shot("paused");

await browser.close();
if (errors.length > 0) {
  console.error("Browser errors:\n" + errors.join("\n"));
  process.exit(1);
}
console.log(`Screenshots written to ${outDir}`);
