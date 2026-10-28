import { App, normalizePath, TFile } from "obsidian";
import { z } from "zod";
import { isWritableVaultPath } from "./guard";

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const fail = (t: string) => ({ content: [{ type: "text" as const, text: `Error: ${t}` }], isError: true });

/**
 * Vault operations that Write/Edit cannot do. The model sees these as mcp__vault__<name>.
 * Moves go through Obsidian, so links to the moved file are updated like a move in the file explorer.
 */
export async function vaultMcpServer(app: App, onWrite: (rel: string) => void) {
	const { createSdkMcpServer, tool } = await import("@anthropic-ai/claude-agent-sdk");
	return createSdkMcpServer({
		name: "vault",
		version: "0.1.0",
		tools: [
			tool(
				"move",
				"Move or rename a note, file or folder inside the vault. Paths are vault-relative. " +
					"Missing parent folders are created. Links to the moved item are updated when the vault " +
					"setting 'Automatically update internal links' is on. Use this instead of shell commands.",
				{
					from: z.string().describe("Current vault-relative path, e.g. Concepts/Stateless system.md"),
					to: z.string().describe("New vault-relative path, e.g. Concepts/Architecture/Stateless system.md"),
				},
				async ({ from, to }) => {
					const src = normalizePath(from);
					const dst = normalizePath(to);
					if (!isWritableVaultPath(src) || !isWritableVaultPath(dst)) return fail("That path is protected or outside the vault.");
					const item = app.vault.getAbstractFileByPath(src);
					if (!item) return fail(`${src} does not exist.`);
					if (app.vault.getAbstractFileByPath(dst)) return fail(`${dst} already exists. Merge the notes by hand instead.`);
					const parent = dst.includes("/") ? dst.slice(0, dst.lastIndexOf("/")) : "";
					if (parent && !app.vault.getAbstractFileByPath(parent)) await app.vault.createFolder(parent);
					await app.fileManager.renameFile(item, dst);
					onWrite(dst);
					const linksUpdated = (app.vault as unknown as { getConfig(k: string): unknown }).getConfig("alwaysUpdateLinks");
					return text(
						`Moved ${src} → ${dst}.` +
							(item instanceof TFile && !linksUpdated
								? " Note: 'Automatically update internal links' is off, so path-style links to the old location were not changed. Name-only [[links]] still work."
								: ""),
					);
				},
			),
		],
	});
}
