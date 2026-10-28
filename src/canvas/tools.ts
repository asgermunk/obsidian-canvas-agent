import { App, normalizePath } from "obsidian";
import { z } from "zod";
import { isWritableVaultPath } from "../agent/guard";
import { CanvasClient, ModuleItem } from "./client";

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const fail = (e: unknown) => ({
	content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
	isError: true,
});

/** In-process MCP server. The model sees these as mcp__canvas__<name>. */
export async function canvasMcpServer(app: App, canvas: CanvasClient) {
	// Loaded on first use so a problem in the SDK cannot stop the plugin from loading.
	const { createSdkMcpServer, tool } = await import("@anthropic-ai/claude-agent-sdk");
	return createSdkMcpServer({
		name: "canvas",
		version: "0.1.0",
		tools: [
			tool("list_courses", "List the user's active Canvas courses with their ids.", {}, async () => {
				try {
					const courses = await canvas.listCourses();
					return text(courses.map((c) => `- ${c.id}: ${c.name} (${c.course_code})`).join("\n"));
				} catch (e) {
					return fail(e);
				}
			}),

			tool(
				"list_modules",
				"List the modules of a Canvas course, with each module's id and item titles.",
				{ courseId: z.number() },
				async ({ courseId }) => {
					try {
						const modules = await canvas.listModules(courseId);
						return text(
							modules
								.map((m) => `## ${m.id}: ${m.name}\n` + (m.items ?? []).map((i) => `  - [${i.type}] ${i.title}`).join("\n"))
								.join("\n\n"),
						);
					} catch (e) {
						return fail(e);
					}
				},
			),

			tool(
				"get_module",
				"Get every item in one Canvas module. Pages, assignments and discussions come back as markdown. " +
					"Files come back as a list with their fileId; call download_file to save one into the vault.",
				{ courseId: z.number(), moduleId: z.number() },
				async ({ courseId, moduleId }) => {
					try {
						const module = (await canvas.listModules(courseId)).find((m) => m.id === moduleId);
						if (!module) return fail(`Module ${moduleId} not found in course ${courseId}`);
						const parts = [`# ${module.name}`];
						for (const item of module.items ?? []) parts.push(await describeItem(canvas, courseId, item));
						return text(parts.join("\n\n"));
					} catch (e) {
						return fail(e);
					}
				},
			),

			tool(
				"download_file",
				"Download a Canvas file into a vault folder, for example the module's attachments/ folder. " +
					"Returns the vault-relative path of the saved file. Skips the download if the file exists.",
				{ fileId: z.number(), folder: z.string().describe("Vault-relative folder, e.g. Semester 5/Subject/Module 03 - Title/attachments") },
				async ({ fileId, folder }) => {
					try {
						const dir = normalizePath(folder);
						if (!isWritableVaultPath(dir)) return fail(`Not allowed to write to ${dir}`);
						const file = await canvas.getFile(fileId);
						const target = normalizePath(`${dir}/${file.display_name.replace(/[\\/:*?"<>|]/g, "-")}`);
						if (await app.vault.adapter.exists(target)) return text(`Already exists: ${target}`);
						if (!(await app.vault.adapter.exists(dir))) await app.vault.createFolder(dir);
						await app.vault.adapter.writeBinary(target, await canvas.downloadFile(file));
						return text(`Saved: ${target} (${Math.round(file.size / 1024)} KB)`);
					} catch (e) {
						return fail(e);
					}
				},
			),
		],
	});
}

async function describeItem(canvas: CanvasClient, courseId: number, item: ModuleItem): Promise<string> {
	const head = `## [${item.type}] ${item.title}`;
	try {
		switch (item.type) {
			case "Page":
				return `${head}\n\n${await canvas.getPageMarkdown(courseId, item.page_url!)}`;
			case "Assignment":
				return `${head}\n\n${await canvas.getAssignmentMarkdown(courseId, item.content_id!)}`;
			case "Discussion":
				return `${head}\n\n${await canvas.getDiscussionMarkdown(courseId, item.content_id!)}`;
			case "File": {
				const f = await canvas.getFile(item.content_id!);
				return `${head}\n\nfileId: ${f.id}, name: ${f.display_name}, type: ${f["content-type"]}, size: ${Math.round(f.size / 1024)} KB`;
			}
			case "ExternalUrl":
				return `${head}\n\nURL: ${item.external_url}`;
			case "SubHeader":
				return `### ${item.title}`;
			default:
				return `${head}\n\n(${item.type} item, not fetched) ${item.html_url ?? ""}`;
		}
	} catch (e) {
		return `${head}\n\n(could not fetch: ${e instanceof Error ? e.message : e})`;
	}
}
