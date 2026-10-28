import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type CanvasAgentPlugin from "./main";

export interface CanvasAgentSettings {
	canvasBaseUrl: string;
	claudePath: string;
	model: string;
	protectedDirs: string;
}

export const DEFAULT_SETTINGS: CanvasAgentSettings = {
	canvasBaseUrl: "https://eaaa.instructure.com",
	claudePath: "",
	model: "",
	protectedDirs: "",
};

const CANVAS_TOKEN_ID = "canvas-agent-canvas-token";
const ANTHROPIC_KEY_ID = "canvas-agent-anthropic-key";

/**
 * Secrets live in Obsidian's SecretStorage (or per-device localStorage on older Obsidian),
 * never in data.json, so a synced or committed vault does not leak them.
 */
export class Secrets {
	constructor(private app: App) {}

	get(id: string): string | null {
		const store = (this.app as App & { secretStorage?: { getSecret(id: string): string | null } }).secretStorage;
		return store ? store.getSecret(id) : (this.app.loadLocalStorage(id) as string | null);
	}

	set(id: string, value: string) {
		const store = (this.app as App & { secretStorage?: { setSecret(id: string, v: string): void } }).secretStorage;
		if (store) store.setSecret(id, value);
		else this.app.saveLocalStorage(id, value || null);
	}

	canvasToken = () => this.get(CANVAS_TOKEN_ID);
	anthropicKey = () => this.get(ANTHROPIC_KEY_ID);
}

export class CanvasAgentSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: CanvasAgentPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const s = this.plugin.settings;
		containerEl.empty();

		new Setting(containerEl).setName("Canvas").setHeading();

		new Setting(containerEl)
			.setName("Canvas URL")
			.setDesc("The address of your school's Canvas.")
			.addText((t) =>
				t.setValue(s.canvasBaseUrl).onChange(async (v) => {
					s.canvasBaseUrl = v.trim();
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Canvas API token")
			.setDesc("Canvas → Account → Settings → New access token. Stored in Obsidian's secret storage, not in the vault.")
			.addText((t) => {
				t.inputEl.type = "password";
				t.setPlaceholder(this.plugin.secrets.canvasToken() ? "•••••• (saved)" : "paste token")
					.onChange((v) => this.plugin.secrets.set(CANVAS_TOKEN_ID, v.trim()));
			})
			.addButton((b) =>
				b.setButtonText("Test connection").onClick(async () => {
					try {
						const courses = await this.plugin.canvas().listCourses();
						new Notice(`Canvas OK: ${courses.length} courses\n` + courses.map((c) => c.name).join("\n"), 8000);
					} catch (e) {
						new Notice(`Canvas failed: ${e instanceof Error ? e.message : e}`, 8000);
					}
				}),
			);

		new Setting(containerEl).setName("Claude").setHeading();

		new Setting(containerEl)
			.setName("Path to the Claude binary")
			.setDesc("npm run deploy fills this in (claude.exe on Windows, claude on Mac). Log in once: run that path in a terminal, then type /login.")
			.addText((t) =>
				t.setValue(s.claudePath).onChange(async (v) => {
					s.claudePath = v.trim().replace(/^"|"$/g, "");
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Anthropic API key (optional)")
			.setDesc("Leave empty to use your Claude login. If set, usage is billed to this key.")
			.addText((t) => {
				t.inputEl.type = "password";
				t.setPlaceholder(this.plugin.secrets.anthropicKey() ? "•••••• (saved)" : "sk-ant-...")
					.onChange((v) => this.plugin.secrets.set(ANTHROPIC_KEY_ID, v.trim()));
			});

		new Setting(containerEl)
			.setName("Model")
			.setDesc("Empty for the default. Example: claude-opus-5-5, claude-sonnet-5-5.")
			.addText((t) =>
				t.setValue(s.model).onChange(async (v) => {
					s.model = v.trim();
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Protected folders")
			.setDesc("Comma separated. The agent may never write here. .obsidian is always protected.")
			.addText((t) =>
				t.setValue(s.protectedDirs).onChange(async (v) => {
					s.protectedDirs = v;
					await this.plugin.saveSettings();
				}),
			);
	}
}
