// Runs a TypeScript module under Vite's module loader and calls its default
// export, so a tool can import the game and the engine exactly as the build
// does:
//
//   node tools/run.mjs tools/capture-replay.ts [args...]

import console from "node:console";
import process from "node:process";
import { resolve } from "node:path";
import { createServer } from "vite";

const [modulePath, ...args] = process.argv.slice(2);
if (modulePath === undefined) {
  console.error("usage: node tools/run.mjs <module.ts> [args...]");
  process.exit(2);
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});
try {
  const module = await server.ssrLoadModule(
    "/" + resolve(modulePath).replace(process.cwd() + "/", ""),
  );
  await module.default(args);
} finally {
  await server.close();
}
