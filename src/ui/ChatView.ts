import { ItemView, MarkdownRenderer, WorkspaceLeaf } from "obsidian";
import type CanvasAgentPlugin from "../main";

export const VIEW_TYPE = "canvas-agent-chat";

export class ChatView extends ItemView {
	private messagesEl!: HTMLElement;
	private statusEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private sendBtn!: HTMLButtonElement;

	constructor(leaf: WorkspaceLeaf, private plugin: CanvasAgentPlugin) {
		super(leaf);
	}

	getViewType() {
		return VIEW_TYPE;
	}
	getDisplayText() {
		return "Canvas Agent";
	}
	getIcon() {
		return "graduation-cap";
	}

	async onOpen() {
		const root = this.contentEl;
		root.empty();
		root.addClass("canvas-agent");

		const bar = root.createDiv("canvas-agent-bar");
		bar.createEl("button", { text: "Module notes…" }).onclick = () => this.plugin.writeModuleNotes();
		bar.createEl("button", { text: "New chat" }).onclick = () => {
			this.plugin.runner.reset();
			this.messagesEl.empty();
			this.setStatus("");
		};

		this.messagesEl = root.createDiv("canvas-agent-messages");
		this.statusEl = root.createDiv("canvas-agent-status");

		const form = root.createDiv("canvas-agent-input");
		this.inputEl = form.createEl("textarea", {
			attr: { placeholder: "Ask about your notes, or: write notes for module 3 in Machine Learning", rows: "3" },
		});
		this.sendBtn = form.createEl("button", { text: "Send", cls: "mod-cta" });
		this.sendBtn.onclick = () => (this.plugin.runner.busy ? this.plugin.runner.stop() : this.submit());
		this.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				if (!this.plugin.runner.busy) this.submit();
			}
		});

		// Rendered [[links]] are plain anchors outside a note view; open them ourselves.
		this.registerDomEvent(this.messagesEl, "click", (e) => {
			const a = (e.target as HTMLElement).closest("a.internal-link") as HTMLAnchorElement | null;
			if (!a) return;
			e.preventDefault();
			this.app.workspace.openLinkText(a.dataset.href ?? a.getAttr("href") ?? "", "", e.ctrlKey || e.metaKey);
		});
		this.registerDomEvent(this.messagesEl, "mouseover", (e) => {
			const a = (e.target as HTMLElement).closest("a.internal-link") as HTMLAnchorElement | null;
			if (!a) return;
			this.app.workspace.trigger("hover-link", {
				event: e,
				source: VIEW_TYPE,
				hoverParent: this,
				targetEl: a,
				linktext: a.dataset.href ?? a.getAttr("href"),
			});
		});
	}

	private submit() {
		const text = this.inputEl.value.trim();
		if (!text) return;
		this.inputEl.value = "";
		this.send(text);
	}

	/** Send a prompt to the agent and stream its reply into the view. */
	async send(prompt: string) {
		this.addMessage("user", prompt);
		this.sendBtn.setText("Stop");
		this.setStatus("Thinking…");
		const written = new Set<string>();
		try {
			await this.plugin.runner.send(prompt, {
				onText: (t) => this.addMessage("assistant", t),
				onStatus: (s) => this.setStatus(s),
				onWrite: (p) => written.add(p),
			});
			if (written.size) {
				const list = [...written].map((p) => `- [[${p.replace(/\.md$/, "")}|${p.split("/").pop()}]]`).join("\n");
				this.addMessage("files", `**Files written:**\n${list}`);
			}
			this.setStatus("");
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			this.setStatus("");
			if (!this.plugin.runner.stoppedByUser) this.addMessage("error", msg);
		} finally {
			this.sendBtn.setText("Send");
		}
	}

	private addMessage(role: "user" | "assistant" | "files" | "error", text: string) {
		const el = this.messagesEl.createDiv(`canvas-agent-msg canvas-agent-${role}`);
		if (role === "user" || role === "error") el.setText(text);
		else MarkdownRenderer.render(this.app, text, el, "", this);
		el.scrollIntoView({ block: "end" });
	}

	private setStatus(s: string) {
		this.statusEl.setText(s);
		this.statusEl.toggle(!!s);
	}
}
