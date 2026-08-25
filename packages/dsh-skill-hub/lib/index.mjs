import z from "@deepseek-ai/schemastery";
import { access, lstat, mkdir, readFile, readdir, rename, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
//#region src/repository.ts
function parseRepositoryUrl(input) {
	let parsed;
	try {
		parsed = new URL(input);
	} catch {
		throw new Error("repository URL must be a valid HTTPS URL");
	}
	if (parsed.protocol !== "https:") throw new Error("repository URL must use HTTPS");
	if (!["github.com", "gitlab.com"].includes(parsed.hostname.toLowerCase())) throw new Error("repository URL must point to GitHub or GitLab");
	const parts = parsed.pathname.split("/").filter(Boolean);
	if (parts.length < 2) throw new Error("repository URL must include an owner and repository name");
	const rawName = parts.at(-1).replace(/\.git$/, "");
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(rawName) || rawName === "." || rawName === "..") throw new Error("repository name is unsafe");
	return {
		url: parsed.toString().replace(/\/$/, ""),
		name: rawName
	};
}
function repositoryPaths(dshHome, profile, ref) {
	const base = path.resolve(dshHome, "skill-hub", "repos");
	const checkout = path.resolve(base, `${profile}-${ref.name}`);
	if (checkout !== base && !checkout.startsWith(`${base}${path.sep}`)) throw new Error("derived repository path escapes DSH_HOME");
	return {
		base,
		checkout,
		skills: path.resolve(checkout, "skills"),
		links: path.resolve(dshHome, "skills"),
		state: path.resolve(dshHome, "skill-hub", "state.json")
	};
}
//#endregion
//#region src/sync.ts
const exists = async (target) => access(target).then(() => true, () => false);
function git(args, cwd) {
	return new Promise((resolve, reject) => {
		const child = spawn("git", args, {
			cwd,
			stdio: [
				"ignore",
				"ignore",
				"pipe"
			]
		});
		let error = "";
		child.stderr.on("data", (chunk) => {
			error += String(chunk);
		});
		child.on("error", reject);
		child.on("close", (code) => code === 0 ? resolve() : reject(/* @__PURE__ */ new Error(`git ${args[0]} failed${error.trim() ? `: ${error.trim().split("\n")[0]}` : ""}`)));
	});
}
var SkillHubSynchronizer = class {
	config;
	dshHome;
	profile;
	statePath;
	state;
	running;
	operationId;
	progress = { phase: "idle" };
	constructor(config) {
		this.config = config;
		this.configure(config);
	}
	configure(config) {
		this.config = config;
		this.dshHome = resolveDshHome(config.dshHome);
		this.profile = config.profile ?? process.env.DSH_PROFILE ?? "web";
		this.statePath = path.resolve(this.dshHome, "skill-hub", "state.json");
	}
	async getState() {
		if (!this.state) try {
			this.state = JSON.parse(await readFile(this.statePath, "utf8"));
		} catch {
			this.state = {
				repositoryUrl: this.config.repositoryUrl,
				checkoutPath: "",
				profile: this.profile,
				createdLinks: []
			};
		}
		return this.state;
	}
	getProgress(operationId) {
		if (operationId !== void 0 && this.progress.operationId !== operationId) return { phase: "idle" };
		return this.progress;
	}
	/** Starts clone + link initialization and returns immediately with an operation id. */
	startInitialize(repositoryUrl, persist) {
		if (this.running && this.operationId) return this.operationId;
		const operationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
		this.operationId = operationId;
		this.progress = {
			phase: "validating",
			operationId,
			message: "正在验证仓库地址…"
		};
		const task = this.performInitialize(repositoryUrl, persist, operationId).then((result) => {
			this.progress = {
				phase: "success",
				operationId,
				result
			};
			return result;
		}).catch((error) => {
			const message = error instanceof Error ? error.message : String(error);
			const stage = this.progress.phase === "error" ? this.progress.stage : this.progress.phase;
			this.progress = {
				phase: "error",
				operationId,
				stage,
				message
			};
			return {
				repositoryUrl,
				checkoutPath: "",
				syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
				linked: 0,
				skipped: 0,
				failed: 1,
				errors: [message]
			};
		}).finally(() => {
			this.running = void 0;
		});
		this.running = task;
		return operationId;
	}
	/** SessionStart is pull-only. It never creates a missing checkout. */
	async sync() {
		if (this.running) return this.running;
		if (!this.config.repositoryUrl.trim()) throw new Error("repository URL is not configured");
		const ref = parseRepositoryUrl(this.config.repositoryUrl);
		const paths = repositoryPaths(this.dshHome, this.profile, ref);
		if (!await exists(path.join(paths.checkout, ".git"))) throw new Error("repository checkout is not initialized; save the repository URL first");
		this.running = this.performPull(ref.url, paths).finally(() => {
			this.running = void 0;
		});
		return this.running;
	}
	async performInitialize(repositoryUrl, persist, operationId) {
		const ref = parseRepositoryUrl(repositoryUrl);
		const paths = repositoryPaths(this.dshHome, this.profile, ref);
		await mkdir(paths.base, { recursive: true });
		await mkdir(paths.links, { recursive: true });
		this.progress = {
			phase: "cloning",
			operationId,
			message: "正在克隆仓库…"
		};
		if (await exists(path.join(paths.checkout, ".git"))) await git([
			"-C",
			paths.checkout,
			"pull",
			"--ff-only"
		]);
		else if (await exists(paths.checkout)) throw new Error("checkout path exists but is not a Git repository");
		else {
			const temporary = `${paths.checkout}.tmp-${process.pid}-${Date.now()}`;
			await git([
				"clone",
				"--",
				ref.url,
				temporary
			]);
			await rename(temporary, paths.checkout);
		}
		this.progress = {
			phase: "scanning",
			operationId,
			message: "正在扫描 Skills…"
		};
		const result = await this.scanAndLink(ref.url, paths, operationId);
		this.progress = {
			phase: "persisting",
			operationId,
			message: "正在保存配置…"
		};
		await persist();
		this.configure({
			...this.config,
			repositoryUrl: ref.url
		});
		return result;
	}
	async performPull(repositoryUrl, paths) {
		try {
			await git([
				"-C",
				paths.checkout,
				"pull",
				"--ff-only"
			]);
		} catch (error) {
			throw new Error(`repository update failed: ${error instanceof Error ? error.message : String(error)}`);
		}
		return this.scanAndLink(repositoryUrl, paths);
	}
	async scanAndLink(repositoryUrl, paths, operationId) {
		const result = {
			repositoryUrl,
			checkoutPath: paths.checkout,
			syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
			linked: 0,
			skipped: 0,
			failed: 0,
			errors: []
		};
		let entries = [];
		try {
			entries = await readdir(paths.skills);
		} catch (error) {
			result.errors.push(`skills directory unavailable: ${error instanceof Error ? error.message : String(error)}`);
		}
		const createdLinks = [];
		if (operationId) this.progress = {
			phase: "linking",
			operationId,
			message: "正在创建链接…"
		};
		for (const name of entries) {
			if (!/^[A-Za-z0-9._-]+$/.test(name) || name === "." || name === "..") {
				result.failed++;
				result.errors.push(`unsafe skill name: ${name}`);
				continue;
			}
			const source = path.resolve(paths.skills, name);
			const marker = path.resolve(source, "SKILL.md");
			const destination = path.resolve(paths.links, name);
			try {
				const stat = await lstat(source);
				const markerStat = await lstat(marker);
				if (!stat.isDirectory() || !markerStat.isFile() || stat.isSymbolicLink()) throw new Error("skill must be a real directory containing a regular SKILL.md");
				if (await exists(destination)) {
					result.skipped++;
					continue;
				}
				await symlink(source, destination, "junction");
				result.linked++;
				createdLinks.push(destination);
			} catch (error) {
				result.failed++;
				result.errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		await this.writeState(result, paths, createdLinks);
		return result;
	}
	async writeState(result, paths, createdLinks = []) {
		const previous = await this.getState();
		this.state = {
			repositoryUrl: result.repositoryUrl,
			checkoutPath: paths.checkout,
			profile: this.profile,
			lastSync: result,
			createdLinks: [...previous.createdLinks, ...createdLinks]
		};
		await mkdir(path.dirname(this.statePath), { recursive: true });
		await writeFile(`${this.statePath}.tmp`, JSON.stringify(this.state, null, 2) + "\n", { mode: 384 });
		await rename(`${this.statePath}.tmp`, this.statePath);
	}
};
//#endregion
//#region src/plugin.ts
const name = "dsh-skill-hub";
const provide = "skillHub";
const SETTINGS_NAMESPACE = "skill-hub";
const Config = z.object({ repositoryUrl: z.string().default("") });
function apply(ctx, config) {
	const resolvedConfig = config ?? { repositoryUrl: "" };
	const service = new SkillHubSynchronizer(resolvedConfig);
	let activeConfig = resolvedConfig;
	let settingsScope;
	ctx.provide("skillHub", service);
	ctx.inject(["settings", "connection"], (services) => {
		settingsScope = services.settings.register(SETTINGS_NAMESPACE, Config, { base: resolvedConfig });
		activeConfig = {
			...resolvedConfig,
			...settingsScope.get()
		};
		service.configure(activeConfig);
		settingsScope.watch((next) => {
			activeConfig = {
				...resolvedConfig,
				...next
			};
			service.configure(activeConfig);
		});
		services.effect(() => services.connection.rpc.handle("/skill-hub", async (endpoint, payload) => {
			if (endpoint === "initialize") {
				if (typeof payload?.repositoryUrl !== "string") return {
					ok: false,
					error: {
						code: "bad-request",
						message: "repositoryUrl must be a string",
						details: { issues: [] }
					}
				};
				if (!settingsScope) return {
					ok: false,
					error: {
						code: "internal",
						message: "settings service is unavailable",
						details: {}
					}
				};
				return {
					ok: true,
					value: { operationId: service.startInitialize(payload.repositoryUrl, () => settingsScope.update({ repositoryUrl: payload.repositoryUrl.trim() })) }
				};
			}
			if (endpoint === "progress") return {
				ok: true,
				value: service.getProgress(typeof payload?.operationId === "string" ? payload.operationId : void 0)
			};
			return {
				ok: false,
				error: {
					code: "bad-request",
					message: `unknown Skill Hub endpoint: ${endpoint}`,
					details: { issues: [] }
				}
			};
		}, { authority: "loopback" }), "dsh-skill-hub: host RPC");
	});
	ctx.on("agent/session-start", () => {
		if (!activeConfig.repositoryUrl.trim()) return;
		service.sync().catch((error) => ctx.logger(name).warn(`sync failed: ${String(error)}`));
	});
}
//#endregion
export { SkillHubSynchronizer, apply, name, parseRepositoryUrl, provide, repositoryPaths };
