import { credentialRef } from "@deepseek-ai/dsh-credentials";
import z from "@deepseek-ai/schemastery";
//#region src/gitlab.ts
const PAGE_SIZE = 100;
function requiredString(record, field) {
	const value = record[field];
	if (typeof value !== "string" || value.length === 0) throw new Error(`GitLab Todo field ${field} is invalid`);
	return value;
}
function optionalString(record, field) {
	const value = record?.[field];
	return typeof value === "string" && value.length > 0 ? value : void 0;
}
function record(value, label) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} is invalid`);
	return value;
}
/** Validate and normalize one GitLab API Todo. */
function parseGitLabTodo(value) {
	const todo = record(value, "GitLab Todo");
	const id = todo.id;
	if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 0) throw new Error("GitLab Todo field id is invalid");
	const target = record(todo.target, "GitLab Todo target");
	const project = todo.project === null || todo.project === void 0 ? void 0 : record(todo.project, "GitLab Todo project");
	const author = todo.author === null || todo.author === void 0 ? void 0 : record(todo.author, "GitLab Todo author");
	return {
		id,
		actionName: requiredString(todo, "action_name"),
		targetType: requiredString(todo, "target_type"),
		targetTitle: requiredString(target, "title"),
		targetUrl: requiredString(target, "web_url"),
		projectName: optionalString(project, "name_with_namespace") ?? optionalString(project, "name"),
		projectUrl: optionalString(project, "web_url"),
		authorName: optionalString(author, "name") ?? optionalString(author, "username"),
		authorAvatarUrl: optionalString(author, "avatar_url"),
		createdAt: requiredString(todo, "created_at")
	};
}
/** Fetch every pending Todo using page-size termination. */
async function fetchPendingTodos(options) {
	const fetchImpl = options.fetchImpl ?? fetch;
	const base = new URL(`${options.domain.replace(/\/+$/, "")}/`);
	const todos = [];
	for (let page = 1;; page += 1) {
		const url = new URL("api/v4/todos", base);
		url.searchParams.set("state", "pending");
		url.searchParams.set("per_page", String(PAGE_SIZE));
		url.searchParams.set("page", String(page));
		const response = await fetchImpl(url, {
			headers: {
				"PRIVATE-TOKEN": options.token,
				Accept: "application/json"
			},
			signal: options.signal
		});
		if (!response.ok) {
			const detail = (await response.text()).slice(0, 240);
			throw new Error(`GitLab API ${response.status}${detail ? `: ${detail}` : ""}`);
		}
		const body = await response.json();
		if (!Array.isArray(body)) throw new Error("GitLab Todo response must be an array");
		todos.push(...body.map(parseGitLabTodo));
		if (body.length < PAGE_SIZE) return todos;
	}
}
//#endregion
//#region src/sync.ts
/** Owns polling state and coalesces overlapping refresh requests. */
var GitLabTodosSynchronizer = class {
	config;
	tokenProvider;
	fetchTodos;
	now;
	inFlight;
	state = {
		status: "idle",
		todos: [],
		revision: 0
	};
	constructor(config, options) {
		this.config = config;
		this.tokenProvider = options.tokenProvider;
		this.fetchTodos = options.fetchTodos ?? fetchPendingTodos;
		this.now = options.now ?? (() => /* @__PURE__ */ new Date());
	}
	configure(config) {
		this.config = config;
	}
	getState() {
		return {
			...this.state,
			todos: [...this.state.todos]
		};
	}
	refresh() {
		if (this.inFlight !== void 0) return this.inFlight;
		const operation = this.runRefresh();
		this.inFlight = operation;
		operation.finally(() => {
			if (this.inFlight === operation) this.inFlight = void 0;
		});
		return operation;
	}
	/** Wait for an older operation, then run against the latest config and credential. */
	async refreshAfterCurrent() {
		const current = this.inFlight;
		if (current !== void 0) await current;
		return this.refresh();
	}
	async runRefresh() {
		this.state = {
			...this.state,
			status: "syncing",
			error: void 0,
			revision: this.state.revision + 1
		};
		try {
			const token = await this.tokenProvider.resolve();
			if (token === void 0 || token.trim() === "") {
				this.state = {
					...this.state,
					status: "unconfigured",
					todos: [],
					error: void 0,
					revision: this.state.revision + 1
				};
				return this.getState();
			}
			const todos = await this.fetchTodos({
				domain: this.config.gitlabDomain,
				token
			});
			this.state = {
				status: "ready",
				todos,
				lastSyncedAt: this.now().toISOString(),
				revision: this.state.revision + 1
			};
		} catch (error) {
			this.state = {
				...this.state,
				status: "error",
				error: error instanceof Error ? error.message : String(error),
				revision: this.state.revision + 1
			};
		}
		return this.getState();
	}
};
//#endregion
//#region src/plugin.ts
const name = "dsh-gitlab-todos";
const provide = "gitLabTodos";
const inject = [
	"settings",
	"credentials",
	"connection"
];
const SETTINGS_NAMESPACE = "gitlab-todos";
const TOKEN_REF = credentialRef("GITLAB_PERSONAL_ACCESS_TOKEN");
const DEFAULT_CONFIG = {
	gitlabDomain: "https://gitlab.com",
	pollIntervalSeconds: 60
};
const Config = z.object({
	gitlabDomain: z.string().default(DEFAULT_CONFIG.gitlabDomain),
	pollIntervalSeconds: z.number().step(1).min(15).max(86400).default(DEFAULT_CONFIG.pollIntervalSeconds)
});
function badRequest(message) {
	return {
		ok: false,
		error: {
			code: "bad-request",
			message,
			details: { issues: [] }
		}
	};
}
/** Register GitLab Todo polling, settings and loopback RPC. */
function apply(ctx, config) {
	const base = {
		...DEFAULT_CONFIG,
		...config
	};
	ctx.inject([
		"settings",
		"credentials",
		"connection"
	], (services) => {
		const scope = services.settings.register(SETTINGS_NAMESPACE, Config, { base });
		let activeConfig = {
			...base,
			...scope.get()
		};
		const synchronizer = new GitLabTodosSynchronizer(activeConfig, { tokenProvider: { resolve: async () => (await services.credentials.resolve(TOKEN_REF))?.value } });
		services.provide("gitLabTodos", synchronizer);
		let timer;
		const restartTimer = () => {
			if (timer !== void 0) clearInterval(timer);
			timer = setInterval(() => {
				synchronizer.refresh().catch((error) => services.logger(name).warn(`refresh failed: ${String(error)}`));
			}, activeConfig.pollIntervalSeconds * 1e3);
		};
		restartTimer();
		synchronizer.refresh();
		const unwatch = scope.watch((next) => {
			activeConfig = {
				...base,
				...next
			};
			synchronizer.configure(activeConfig);
			restartTimer();
			synchronizer.refreshAfterCurrent();
		});
		services.effect(() => services.connection.rpc.handle("/gitlab-todos", async (endpoint, payload) => {
			switch (endpoint) {
				case "state": return {
					ok: true,
					value: synchronizer.getState()
				};
				case "refresh": return {
					ok: true,
					value: await synchronizer.refresh()
				};
				case "token/describe": return {
					ok: true,
					value: await services.credentials.describe(TOKEN_REF)
				};
				case "token/set":
					if (typeof payload?.token !== "string" || payload.token.trim() === "") return badRequest("token must be a non-empty string");
					await services.credentials.set(TOKEN_REF, payload.token.trim());
					return {
						ok: true,
						value: await synchronizer.refreshAfterCurrent()
					};
				case "token/unset":
					await services.credentials.unset(TOKEN_REF);
					return {
						ok: true,
						value: await synchronizer.refreshAfterCurrent()
					};
				default: return badRequest(`unknown GitLab Todos endpoint: ${endpoint}`);
			}
		}, { authority: "loopback" }), "dsh-gitlab-todos: host RPC");
		services.effect(() => () => {
			if (timer !== void 0) clearInterval(timer);
			unwatch?.();
		}, "dsh-gitlab-todos: polling timer");
	});
}
//#endregion
export { Config, DEFAULT_CONFIG, GitLabTodosSynchronizer, SETTINGS_NAMESPACE, TOKEN_REF, apply, fetchPendingTodos, inject, name, parseGitLabTodo, provide };
