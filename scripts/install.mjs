// Copy the built plugin into a vault.
//   node scripts/install.mjs "/path/to/your vault"
// The vault path is remembered in .vault-path, so later "npm run deploy" needs no argument.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

const arg = process.argv[2] ?? process.env.OBSIDIAN_VAULT;
const saved = existsSync(".vault-path") ? readFileSync(".vault-path", "utf8").trim() : null;
const vaultArg = arg ?? saved;
if (!vaultArg) {
	console.error('Give the path to your vault: node scripts/install.mjs "/path/to/your vault"');
	process.exit(1);
}
const vault = resolve(vaultArg);
if (!existsSync(join(vault, ".obsidian"))) {
	console.error(`${vault} is not an Obsidian vault (no .obsidian folder). Open it in Obsidian once first.`);
	process.exit(1);
}
writeFileSync(".vault-path", vault);

const dest = join(vault, ".obsidian", "plugins", "canvas-agent");
mkdirSync(dest, { recursive: true });
for (const f of ["main.js", "manifest.json", "styles.css"]) copyFileSync(f, join(dest, f));

// npm installs only the Claude binary for this OS and CPU, e.g. claude-agent-sdk-darwin-arm64/claude.
function findClaude() {
	const scope = resolve("node_modules/@anthropic-ai");
	for (const dir of readdirSync(scope).filter((d) => d.startsWith("claude-agent-sdk-"))) {
		for (const bin of ["claude.exe", "claude"]) {
			const p = join(scope, dir, bin);
			if (existsSync(p)) return p;
		}
	}
	return null;
}

// Point the plugin at that binary, unless the user already set a path that still exists.
const dataFile = join(dest, "data.json");
const data = existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, "utf8")) : {};
if (!data.claudePath || !existsSync(data.claudePath)) {
	data.claudePath = findClaude() ?? "";
	writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

console.log(`Installed to ${dest}`);
console.log(`Claude binary: ${data.claudePath || "(not found: run npm install)"}`);
console.log(`Log in once (skip if done):\n  "${data.claudePath}"   then type /login`);
