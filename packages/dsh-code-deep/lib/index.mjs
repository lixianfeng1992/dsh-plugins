import { defineTool } from "@deepseek-ai/dsh-tools";
import { realpath } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CodeDeepClient } from "@team-harness/code-deep";
//#region src/session-cwd.ts
function sessionCwd(exec) {
	const cwd = exec.agent?.session.header.cwd;
	if (cwd === void 0) throw new Error("code-deep requires a calling agent with a session workspace cwd");
	return cwd;
}
//#endregion
//#region src/explore-tool.ts
function projectExploreText(text, detailLevel) {
	const files = [...text.matchAll(/(?:^|\n)(?:File|Source file):\s*([^\n]+)/gi)].map((match) => match[1].trim());
	const returnedSourceFiles = [...new Set(files)];
	const truncated = /truncat|omitted|\.\.\./i.test(text);
	return {
		text: detailLevel === "minimal" ? text.split("\n").slice(0, 80).join("\n") : text,
		metadata: {
			detailLevel,
			sourceFilesFound: returnedSourceFiles.length,
			sourceFilesReturned: returnedSourceFiles.length,
			sourceFilesOmitted: 0,
			returnedSourceFiles,
			omittedSourceFiles: [],
			truncated
		}
	};
}
const outputSchema$1 = {
	type: "object",
	additionalProperties: false,
	properties: {
		text: {
			type: "string",
			required: true
		},
		detailLevel: {
			type: "string",
			enum: ["minimal", "standard"],
			required: true
		},
		sourceFilesFound: {
			type: "integer",
			required: true
		},
		sourceFilesReturned: {
			type: "integer",
			required: true
		},
		sourceFilesOmitted: {
			type: "integer",
			required: true
		},
		returnedSourceFiles: {
			type: "array",
			items: { type: "string" },
			required: true
		},
		omittedSourceFiles: {
			type: "array",
			items: { type: "string" },
			required: true
		},
		truncated: {
			type: "boolean",
			required: true
		}
	}
};
function createExploreTool(clients) {
	return defineTool({
		name: "code_deep_explore",
		description: "Explore the calling agent session workspace using code structure and dependency context.",
		parameters: {
			query: {
				type: "string",
				required: true,
				description: "Task, symbols/files, and relationships to trace."
			},
			maxFiles: {
				type: "integer",
				description: "Maximum source files to return (1-50)."
			},
			detailLevel: {
				type: "string",
				enum: ["minimal", "standard"]
			}
		},
		output: {
			schema: outputSchema$1,
			render: (_args, value) => [{
				type: "text",
				text: value.text
			}]
		},
		async execute(args, exec) {
			if (args.maxFiles !== void 0 && (args.maxFiles < 1 || args.maxFiles > 50)) throw new Error("maxFiles must be between 1 and 50");
			const projection = projectExploreText(await (await clients.get(sessionCwd(exec))).explore(args.query, { maxFiles: args.maxFiles }), args.detailLevel ?? "standard");
			const metadata = projection.metadata;
			return {
				text: projection.text,
				detailLevel: metadata.detailLevel,
				sourceFilesFound: metadata.sourceFilesFound,
				sourceFilesReturned: metadata.sourceFilesReturned,
				sourceFilesOmitted: metadata.sourceFilesOmitted,
				returnedSourceFiles: metadata.returnedSourceFiles,
				omittedSourceFiles: metadata.omittedSourceFiles,
				truncated: metadata.truncated
			};
		}
	});
}
//#endregion
//#region src/review-tool.ts
const json = { type: "json" };
const outputSchema = {
	type: "object",
	additionalProperties: true,
	properties: {
		schemaVersion: {
			type: "integer",
			required: true
		},
		summary: {
			...json,
			required: true
		},
		files: {
			type: "array",
			items: json,
			required: true
		},
		impacts: {
			type: "array",
			items: json,
			required: true
		},
		reviewItems: {
			type: "array",
			items: json,
			required: true
		},
		riskSignals: {
			type: "array",
			items: json,
			required: true
		},
		ignoredPaths: {
			type: "array",
			items: { type: "string" },
			required: true
		},
		graphContext: {
			type: "string",
			required: true
		},
		markdown: {
			type: "string",
			required: true
		}
	}
};
function createReviewTool(clients) {
	return defineTool({
		name: "code_deep_review",
		description: "Review the calling agent session workspace or a supplied diff/range with code impact analysis.",
		parameters: {
			diff: {
				type: "string",
				description: "Patch to review; mutually exclusive with base/head."
			},
			base: {
				type: "string",
				description: "Base ref; required when head is supplied."
			},
			head: {
				type: "string",
				description: "Head ref; requires base."
			},
			maxFiles: { type: "integer" },
			maxSymbols: { type: "integer" },
			detailLevel: {
				type: "string",
				enum: ["minimal", "standard"]
			}
		},
		output: {
			schema: outputSchema,
			render: (_args, value) => [{
				type: "text",
				text: value.markdown
			}]
		},
		async execute(args, exec) {
			if (args.diff !== void 0 && (args.base !== void 0 || args.head !== void 0)) throw new Error("diff cannot be combined with base/head");
			if (args.head !== void 0 && args.base === void 0) throw new Error("head requires base");
			const report = await (await clients.get(sessionCwd(exec))).review({
				diff: args.diff,
				base: args.base,
				head: args.head,
				maxFiles: args.maxFiles,
				maxSymbols: args.maxSymbols
			});
			if (args.detailLevel === "minimal") return JSON.parse(JSON.stringify({
				...report,
				files: [],
				impacts: [],
				graphContext: ""
			}));
			return JSON.parse(JSON.stringify(report));
		}
	});
}
//#endregion
//#region src/clients.ts
const execFileAsync = promisify(execFile);
async function gitRoot(projectPath) {
	try {
		const { stdout } = await execFileAsync("git", [
			"-C",
			projectPath,
			"rev-parse",
			"--show-toplevel"
		]);
		return realpath(stdout.trim());
	} catch {
		throw new Error(`projectPath must be an existing Git repository root: ${projectPath}`);
	}
}
var ProjectClientCache = class {
	clients = /* @__PURE__ */ new Map();
	async get(projectPath) {
		if (!projectPath || !projectPath.startsWith("/")) throw new Error(`projectPath must be an absolute path: ${projectPath || "<empty>"}`);
		const requested = await realpath(projectPath).catch(() => {
			throw new Error(`projectPath does not exist: ${projectPath}`);
		});
		const root = await gitRoot(requested);
		if (root !== requested) throw new Error(`projectPath must be the Git repository root (${root}): ${projectPath}`);
		const existing = this.clients.get(root);
		if (existing) return existing;
		const client = new CodeDeepClient({ projectPath: root });
		this.clients.set(root, client);
		return client;
	}
	async close() {
		const clients = [...this.clients.values()];
		this.clients.clear();
		await Promise.all(clients.map((client) => client.close()));
	}
};
//#endregion
//#region src/plugin.ts
const name = "dsh-code-deep";
const inject = ["tools"];
function apply(ctx) {
	const clients = new ProjectClientCache();
	ctx.effect(() => () => {
		clients.close();
	});
	ctx.tools.register(createExploreTool(clients));
	ctx.tools.register(createReviewTool(clients));
}
//#endregion
export { ProjectClientCache, apply, createExploreTool, createReviewTool, inject, name, sessionCwd };
