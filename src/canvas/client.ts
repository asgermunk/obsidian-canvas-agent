import { htmlToMarkdown, requestUrl, RequestUrlResponse } from "obsidian";

export interface Course {
	id: number;
	name: string;
	course_code: string;
}

export interface ModuleItem {
	id: number;
	title: string;
	type: string; // File, Page, Assignment, Discussion, Quiz, SubHeader, ExternalUrl, ExternalTool
	content_id?: number;
	page_url?: string;
	external_url?: string;
	html_url?: string;
	indent?: number;
}

export interface Module {
	id: number;
	name: string;
	position: number;
	items?: ModuleItem[];
}

export interface CanvasFile {
	id: number;
	display_name: string;
	filename: string;
	url: string;
	size: number;
	"content-type": string;
}

/** Thin read-only wrapper around the Canvas REST API. The token never leaves this class. */
export class CanvasClient {
	constructor(private baseUrl: string, private getToken: () => string | null) {}

	private token(): string {
		const t = this.getToken();
		if (!t) throw new Error("No Canvas API token. Set it in Settings → Canvas Agent.");
		return t;
	}

	private async get(pathOrUrl: string): Promise<RequestUrlResponse> {
		const url = pathOrUrl.startsWith("http")
			? pathOrUrl
			: `${this.baseUrl.replace(/\/$/, "")}/api/v1${pathOrUrl}`;
		const res = await requestUrl({
			url,
			headers: { Authorization: `Bearer ${this.token()}` },
			throw: false,
		});
		if (res.status >= 400) {
			throw new Error(`Canvas ${res.status} on ${url.replace(/\?.*/, "")}: ${res.text.slice(0, 200)}`);
		}
		return res;
	}

	/** Follow the Link: rel="next" header until every page is read. */
	private async getAll<T>(path: string): Promise<T[]> {
		const out: T[] = [];
		let next: string | null = path + (path.includes("?") ? "&" : "?") + "per_page=100";
		while (next) {
			const res = await this.get(next);
			out.push(...(res.json as T[]));
			const link = res.headers["link"] ?? res.headers["Link"] ?? "";
			next = /<([^>]+)>;\s*rel="next"/.exec(link)?.[1] ?? null;
		}
		return out;
	}

	listCourses(): Promise<Course[]> {
		return this.getAll<Course>("/courses?enrollment_state=active");
	}

	listModules(courseId: number): Promise<Module[]> {
		return this.getAll<Module>(`/courses/${courseId}/modules?include[]=items`);
	}

	async getPageMarkdown(courseId: number, pageUrl: string): Promise<string> {
		const res = await this.get(`/courses/${courseId}/pages/${encodeURIComponent(pageUrl)}`);
		return htmlToMarkdown(res.json.body ?? "");
	}

	async getAssignmentMarkdown(courseId: number, assignmentId: number): Promise<string> {
		const res = await this.get(`/courses/${courseId}/assignments/${assignmentId}`);
		const due = res.json.due_at ? `Due: ${res.json.due_at}\n\n` : "";
		return due + htmlToMarkdown(res.json.description ?? "");
	}

	async getDiscussionMarkdown(courseId: number, topicId: number): Promise<string> {
		const res = await this.get(`/courses/${courseId}/discussion_topics/${topicId}`);
		return htmlToMarkdown(res.json.message ?? "");
	}

	async getFile(fileId: number): Promise<CanvasFile> {
		return (await this.get(`/files/${fileId}`)).json as CanvasFile;
	}

	async downloadFile(file: CanvasFile): Promise<ArrayBuffer> {
		return (await this.get(file.url)).arrayBuffer;
	}
}
