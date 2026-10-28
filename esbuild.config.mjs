import esbuild from "esbuild";
import builtins from "builtin-modules";

const watch = process.argv.includes("--watch");

// The Agent SDK is ESM and calls createRequire(import.meta.url) at load time.
// Obsidian loads plugins as CommonJS, so give import.meta.url a valid file URL.
// The SDK only uses it to find claude.exe, and we always pass that path ourselves.
const META_URL =
  'var __canvasAgentMetaUrl = require("url").pathToFileURL(require("path").join(process.cwd(), "canvas-agent.js")).href;';

// Obsidian's window has the browser AbortController, but Node's events.setMaxListeners
// only accepts Node's AbortSignal and throws on the browser one. The call only raises
// a listener warning limit, so skip it for a signal that Node rejects.
const ABORT_SIGNAL_SHIM = `(function () {
  var events = require("events"), original = events.setMaxListeners;
  if (original.__canvasAgent) return;
  var patched = function () {
    try { return original.apply(this, arguments); }
    catch (e) { if (e && e.code === "ERR_INVALID_ARG_TYPE") return; throw e; }
  };
  patched.__canvasAgent = true;
  events.setMaxListeners = patched;
})();`;

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "es2022",
  outfile: "main.js",
  external: ["obsidian", "electron", ...builtins, ...builtins.map((m) => `node:${m}`)],
  define: { "import.meta.url": "__canvasAgentMetaUrl" },
  banner: { js: [META_URL, ABORT_SIGNAL_SHIM].join("\n") },
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
});

if (watch) await ctx.watch();
else {
  await ctx.rebuild();
  await ctx.dispose();
}
