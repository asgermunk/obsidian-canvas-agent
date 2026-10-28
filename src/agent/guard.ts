import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk";
import * as path from "path";

let protectedDirs: string[] = [];

/** Folders the agent must never write to, relative to the vault root. */
export function setProtectedDirs(dirs: string[]) {
	protectedDirs = dirs.map((d) => d.trim().replace(/\\/g, "/").replace(/\/$/, "").toLowerCase()).filter(Boolean);
}

/** True when a vault-relative path is inside the vault and outside every protected folder. */
export function isWritableVaultPath(rel: string): boolean {
	const p = rel.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
	if (p.split("/").includes("..")) return false;
	if (p === ".obsidian" || p.startsWith(".obsidian/") || p.startsWith(".git/")) return false;
	return !protectedDirs.some((d) => p === d || p.startsWith(d + "/"));
}

/**
 * Permission callback for tools that allowedTools does not pre-approve.
 * File writes are allowed inside the vault only; skill scripts may run; everything else is denied.
 */
export function makeGuard(vaultRoot: string, onWrite: (rel: string) => void): CanUseTool {
	const root = path.resolve(vaultRoot);
	return async (toolName, input) => {
		if (toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit") {
			const abs = path.resolve(root, String(input.file_path ?? ""));
			const rel = path.relative(root, abs);
			if (rel.startsWith("..") || path.isAbsolute(rel) || !isWritableVaultPath(rel)) {
				return { behavior: "deny", message: `Writing to ${abs} is not allowed. Write only inside the vault, outside protected folders.` };
			}
			onWrite(rel.replace(/\\/g, "/"));
			return { behavior: "allow", updatedInput: input };
		}
		// On Windows Claude Code runs shell commands through a PowerShell tool instead of Bash.
		if (toolName === "Bash" || toolName === "PowerShell") {
			const cmd = String(input.command ?? "");
			// The vault skills ship small read-only python helpers (extract_pptx, check_vault, vault_index).
			if (/^python3?\s+(-I\s+)?"?\.claude[\\/]skills[\\/][\w-]+[\\/]scripts[\\/][\w-]+\.py"?(\s|$)/.test(cmd) && !/[;&|`$><]/.test(cmd)) {
				return { behavior: "allow", updatedInput: input };
			}
			return {
				behavior: "deny",
				message: "Only the python scripts in .claude/skills/*/scripts may run. To move or rename a file, use mcp__vault__move.",
			};
		}
		return { behavior: "deny", message: `${toolName} is not available in Canvas Agent.` };
	};
}
