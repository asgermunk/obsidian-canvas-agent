import { FileSystemAdapter, Notice, Plugin } from "obsidian";
import { CanvasClient } from "./canvas/client";
import { canvasMcpServer } from "./canvas/tools";
import { setProtectedDirs } from "./agent/guard";
import { AgentRunner } from "./agent/runner";
import { vaultMcpServer } from "./agent/vaultTools";
import { CanvasAgentSettings, CanvasAgentSettingTab, DEFAULT_SETTINGS, Secrets } from "./settings";
import { ChatView, VIEW_TYPE } from "./ui/ChatView";
import { pickModule } from "./ui/pickers";

export default class CanvasAgentPlugin extends Plugin {
	declare settings: CanvasAgentSettings;
	secrets!: Secrets;
	runner!: AgentRunner;

	async onload() {
		await this.loadSettings();
		this.secrets = new Secrets(this.app);

		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			new Notice("Canvas Agent needs the desktop app.");
			return;
		}

		this.runner = new AgentRunner(() => ({
			vaultRoot: adapter.getBasePath(),
			claudePath: this.settings.claudePath,
			model: this.settings.model,
			apiKey: this.secrets.anthropicKey(),
			canvasServer: () => canvasMcpServer(this.app, this.canvas()),
			vaultServer: (onWrite) => vaultMcpServer(this.app, onWrite),
			logFile: `${adapter.getBasePath()}/${this.manifest.dir}/debug.log`,
		}));

		this.registerView(VIEW_TYPE, (leaf) => new ChatView(leaf, this));
		this.registerHoverLinkSource(VIEW_TYPE, { display: "Canvas Agent", defaultMod: false });
		this.addRibbonIcon("graduation-cap", "Canvas Agent", () => this.openView());
		this.addSettingTab(new CanvasAgentSettingTab(this.app, this));

		this.addCommand({ id: "open-chat", name: "Open chat", callback: () => this.openView() });
		this.addCommand({ id: "write-module-notes", name: "Write notes for a Canvas module", callback: () => this.writeModuleNotes() });
	}

	onunload() {
		this.runner?.stop();
	}

	canvas() {
		return new CanvasClient(this.settings.canvasBaseUrl, this.secrets.canvasToken);
	}

	async openView(): Promise<ChatView> {
		let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
		if (!leaf) {
			leaf = this.app.workspace.getRightLeaf(false)!;
			await leaf.setViewState({ type: VIEW_TYPE, active: true });
		}
		this.app.workspace.revealLeaf(leaf);
		return leaf.view as ChatView;
	}

	writeModuleNotes() {
		pickModule(this.app, this.canvas(), async (course, module) => {
			const view = await this.openView();
			view.send(
				`Write notes for the Canvas module "${module.name}" (moduleId ${module.id}) ` +
					`in the course "${course.name}" (courseId ${course.id}).`,
			);
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		setProtectedDirs(this.settings.protectedDirs.split(","));
	}

	async saveSettings() {
		await this.saveData(this.settings);
		setProtectedDirs(this.settings.protectedDirs.split(","));
	}
}
