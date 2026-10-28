import { App, Notice, SuggestModal } from "obsidian";
import type { CanvasClient, Course, Module } from "../canvas/client";

class ListModal<T> extends SuggestModal<T> {
	constructor(
		app: App,
		private items: T[],
		private label: (t: T) => string,
		private pick: (t: T) => void,
		placeholder: string,
	) {
		super(app);
		this.setPlaceholder(placeholder);
	}
	getSuggestions(q: string): T[] {
		const s = q.toLowerCase();
		return this.items.filter((i) => this.label(i).toLowerCase().includes(s));
	}
	renderSuggestion(item: T, el: HTMLElement) {
		el.setText(this.label(item));
	}
	onChooseSuggestion(item: T) {
		this.pick(item);
	}
}

/** Course picker, then module picker, both read live from Canvas. */
export async function pickModule(app: App, canvas: CanvasClient, done: (course: Course, module: Module) => void) {
	try {
		const courses = await canvas.listCourses();
		new ListModal(app, courses, (c) => c.name, async (course) => {
			try {
				const modules = await canvas.listModules(course.id);
				new ListModal(app, modules, (m) => m.name, (module) => done(course, module), `Module in ${course.name}`).open();
			} catch (e) {
				new Notice(`Canvas: ${e instanceof Error ? e.message : e}`);
			}
		}, "Pick a course").open();
	} catch (e) {
		new Notice(`Canvas: ${e instanceof Error ? e.message : e}`);
	}
}
