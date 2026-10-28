import type { McpSdkServerConfigWithInstance, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { appendFileSync } from "fs";
import { makeGuard } from "./guard";
import { CANVAS_AGENT_PROMPT } from "./prompt";

export interface RunnerConfig {
	vaultRoot: string;
	claudePath: string;
	model: string;
	apiKey: string | null;
	canvasServer: () => Promise<McpSdkServerConfigWithInstance>;
	vaultServer: (onWrite: (rel: string) => void) => Promise<McpSdkServerConfigWithInstance>;
	logFile: string;
}

export interface RunHandlers {
	onText(text: string): void;
	onStatus(status: string): void;
	onWrite(path: string): void;
}

// Approved without the guard. The plugin's own tools check vault paths themselves.
const PRE_APPROVED_TOOLS = [
	"Read",
	"Glob",
	"Grep",
	"WebSearch",
	"WebFetch",
	"Skill",
	"TodoWrite",
	"mcp__canvas__list_courses",
	"mcp__canvas__list_modules",
	"mcp__canvas__get_module",
	"mcp__canvas__download_file",
	"mcp__vault__move",
];

/** One chat thread with Claude. Each send() resumes the same session, so follow-ups keep context. */
export class AgentRunner {
	private sessionId: string | undefined;
	private abort: AbortController | null = null;
	/** True when the user pressed Stop, so the view can skip the abort error. */
	stoppedByUser = false;

	constructor(private config: () => RunnerConfig) {}

	get busy() {
		return this.abort !== null;
	}

	reset() {
		this.stop();
		this.sessionId = undefined;
	}

	stop() {
		if (this.abort) this.stoppedByUser = true;
		this.abort?.abort();
		this.abort = null;
	}

	async send(prompt: string, h: RunHandlers): Promise<void> {
		const cfg = this.config();
		if (!cfg.claudePath) throw new Error("Set the path to the Claude binary in Settings → Canvas Agent.");

		this.abort = new AbortController();
		this.stoppedByUser = false;
		const log = (line: string) => {
			try {
				appendFileSync(cfg.logFile, `${new Date().toISOString()} ${line}\n`);
			} catch {
				// The log is a debugging aid only.
			}
		};
		const stderr: string[] = [];
		let gotText = false;
		log(`send: ${prompt.slice(0, 120)}`);
		const env: Record<string, string> = { ...(process.env as Record<string, string>) };
		if (cfg.apiKey) env.ANTHROPIC_API_KEY = cfg.apiKey;

		try {
			// Loaded on first use so a problem in the SDK cannot stop the plugin from loading.
			const { query } = await import("@anthropic-ai/claude-agent-sdk");
			const stream = query({
				prompt,
				options: {
					cwd: cfg.vaultRoot,
					pathToClaudeCodeExecutable: cfg.claudePath,
					settingSources: ["project"],
					systemPrompt: { type: "preset", preset: "claude_code", append: CANVAS_AGENT_PROMPT },
					model: cfg.model || undefined,
					env,
					mcpServers: { canvas: await cfg.canvasServer(), vault: await cfg.vaultServer(h.onWrite) },
					allowedTools: PRE_APPROVED_TOOLS,
					canUseTool: makeGuard(cfg.vaultRoot, h.onWrite),
					abortController: this.abort,
					resume: this.sessionId,
					stderr: (d) => {
						log(`stderr: ${d.trimEnd()}`);
						stderr.push(...d.trimEnd().split("\n"));
						stderr.splice(0, Math.max(0, stderr.length - 15));
					},
				},
			});
			for await (const msg of stream) {
				log(`msg: ${msg.type}${"subtype" in msg ? " " + msg.subtype : ""}${msg.type === "result" ? " " + JSON.stringify(msg).slice(0, 500) : ""}`);
				if (this.handle(msg, h)) gotText = true;
			}
			if (!gotText) h.onText("*(Claude ended the turn without a reply.)*");
		} catch (e) {
			log(`error: ${e instanceof Error ? e.stack : e}`);
			if (this.stoppedByUser) throw e;
			const detail = stderr.length ? `\n\nClaude output:\n${stderr.join("\n")}` : "";
			throw new Error(`${e instanceof Error ? e.message : String(e)}${detail}`);
		} finally {
			this.abort = null;
		}
	}

	/** Returns true when the message put text in the chat. */
	private handle(msg: SDKMessage, h: RunHandlers): boolean {
		let text = false;
		if ("session_id" in msg && msg.session_id) this.sessionId = msg.session_id;

		if (msg.type === "assistant") {
			if (msg.error === "authentication_failed") {
				throw new Error(
					"Claude is not logged in. Run the Claude binary from Settings → Canvas Agent in a terminal and type /login, or add an Anthropic API key in the settings.",
				);
			}
			// Sub-agent chatter stays out of the chat; only top-level text is the answer.
			if (msg.parent_tool_use_id) return false;
			for (const block of msg.message.content) {
				if (block.type === "text" && block.text.trim()) {
					h.onText(block.text);
					text = true;
				}
				if (block.type === "tool_use") h.onStatus(describeTool(block.name, block.input as Record<string, unknown>));
			}
		} else if (msg.type === "result") {
			if (msg.subtype !== "success" || msg.is_error) {
				const errors = "errors" in msg ? msg.errors.join("; ") : "";
				throw new Error(`Claude stopped (${msg.subtype}). ${errors || ("result" in msg ? msg.result : "")}`);
			}
			h.onStatus("");
		}
		return text;
	}
}

function describeTool(name: string, input: Record<string, unknown>): string {
	const short = (v: unknown) => String(v ?? "").split(/[\\/]/).slice(-2).join("/");
	switch (name) {
		case "Read":
			return `Reading ${short(input.file_path)}`;
		case "Write":
			return `Writing ${short(input.file_path)}`;
		case "Edit":
			return `Editing ${short(input.file_path)}`;
		case "Glob":
		case "Grep":
			return `Searching the vault for ${input.pattern}`;
		case "WebSearch":
			return `Searching the web: ${input.query}`;
		case "WebFetch":
			return `Fetching ${input.url}`;
		case "mcp__vault__move":
			return `Moving ${short(input.from)} → ${short(input.to)}`;
		case "Bash":
		case "PowerShell":
			return "Running a vault script";
		default:
			return name.startsWith("mcp__canvas__") ? `Canvas: ${name.slice(13).replace(/_/g, " ")}` : name;
	}
}
