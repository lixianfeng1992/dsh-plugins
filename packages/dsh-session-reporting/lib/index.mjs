import { getOrCreateAnonymousUserId } from "@deepseek-ai/dsh-anonymous-user-id";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Pool } from "pg";
//#region src/reporter.ts
const execFileAsync = promisify(execFile);
function canonicalRemote(remote) {
	const value = remote.trim().replace(/\.git$/u, "");
	const scp = value.match(/^[^@]+@([^:]+):(.+)$/u);
	if (scp !== null) return `${scp[1]}/${scp[2]}`;
	const url = new URL(value);
	return `${url.host}/${url.pathname.replace(/^\//u, "")}`;
}
async function resolveRepository(cwd) {
	try {
		const root = (await execFileAsync("git", [
			"-C",
			cwd,
			"rev-parse",
			"--show-toplevel"
		])).stdout.trim();
		return {
			canonicalRemote: canonicalRemote((await execFileAsync("git", [
				"-C",
				cwd,
				"remote",
				"get-url",
				"origin"
			])).stdout.trim()),
			rootPath: root
		};
	} catch {
		return;
	}
}
var SessionReporter = class {
	config;
	pool;
	tails = /* @__PURE__ */ new Map();
	repositories = /* @__PURE__ */ new Map();
	initPromise;
	constructor(config, poolConfig) {
		this.config = config;
		this.pool = new Pool({
			connectionString: config.connectionString,
			...poolConfig
		});
	}
	async initialize() {
		if (this.initPromise !== void 0) return this.initPromise;
		this.initPromise = this.initializeSchema();
		return this.initPromise;
	}
	async initializeSchema() {
		const fs = await import("node:fs/promises");
		const path = new URL("../schema.sql", import.meta.url);
		await this.pool.query(await fs.readFile(path, "utf8"));
		await this.pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'reporting_session_events' AND column_name = 'event' AND data_type = 'jsonb'
        ) THEN
          ALTER TABLE reporting_session_events ALTER COLUMN event TYPE text USING event::text;
        END IF;
      END $$;
    `);
	}
	enqueue(session, event) {
		const next = (this.tails.get(session.id) ?? Promise.resolve()).then(() => this.append(session, event)).finally(() => {
			if (this.tails.get(session.id) === next) this.tails.delete(session.id);
		});
		this.tails.set(session.id, next);
		return next;
	}
	async append(session, event) {
		await this.initialize();
		const cwd = session.header.cwd ?? process.cwd();
		let repoPromise = this.repositories.get(session.id);
		if (repoPromise === void 0) {
			repoPromise = resolveRepository(cwd);
			this.repositories.set(session.id, repoPromise);
		}
		const repo = await repoPromise;
		if (repo === void 0) return;
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN");
			await client.query("INSERT INTO reporting_users (id) VALUES ($1) ON CONFLICT DO NOTHING", [this.config.userId]);
			await client.query(`INSERT INTO reporting_sessions (id, user_id, canonical_remote, repo_root_path, created_at, cwd, parent_session, seed_length, header)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET updated_at = now()`, [
				session.id,
				this.config.userId,
				repo.canonicalRemote,
				repo.rootPath,
				session.header.createdAt,
				session.header.cwd ?? repo.rootPath,
				session.header.parentSession ?? null,
				session.header.seedLength ?? null,
				session.header
			]);
			await client.query("INSERT INTO reporting_session_events (session_id, seq, type, event_time, event) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (session_id, seq) DO NOTHING", [
				session.id,
				event.seq,
				event.type,
				event.time,
				JSON.stringify(event)
			]);
			await client.query("UPDATE reporting_sessions SET last_seq = GREATEST(last_seq, $2), updated_at = now() WHERE id = $1", [session.id, event.seq]);
			await client.query("COMMIT");
		} catch (error) {
			await client.query("ROLLBACK").catch(() => void 0);
			throw error;
		} finally {
			client.release();
		}
	}
	async close() {
		await Promise.all(this.tails.values());
		await this.pool.end();
	}
	async listSessions() {
		return (await this.pool.query(`SELECT s.id, s.user_id, s.canonical_remote, s.created_at, s.cwd, s.last_seq,
              s.updated_at, count(e.seq)::int AS event_count
       FROM reporting_sessions s
       LEFT JOIN reporting_session_events e ON e.session_id = s.id
       GROUP BY s.id ORDER BY s.updated_at DESC`)).rows;
	}
	async listEvents(sessionId) {
		return (await this.pool.query("SELECT session_id, seq, type, event_time, event FROM reporting_session_events WHERE session_id = $1 ORDER BY seq", [sessionId])).rows;
	}
};
//#endregion
//#region src/index.ts
const name = "dsh-session-reporting";
const provide = "sessionReporter";
const inject = ["connection"];
/** Local PostgreSQL endpoint used by the prototype bundle. */
const DEFAULT_DATABASE_URL = "postgresql://dsh:dsh@localhost:5432/dsh_reporting";
function apply(ctx) {
	const reporter = new SessionReporter({
		connectionString: DEFAULT_DATABASE_URL,
		userId: getOrCreateAnonymousUserId()
	});
	reporter.initialize().catch((error) => ctx.logger.warn(`session reporting database init failed: ${String(error)}`));
	ctx.on("session/event", (session, event) => {
		reporter.enqueue(session, event).catch((error) => ctx.logger.warn(`session reporting append failed: ${String(error)}`));
	});
	ctx.inject(["connection"], (services) => services.connection.rpc.handle("/session-reporting", async (endpoint, payload) => {
		if (endpoint === "sessions") return {
			ok: true,
			value: await reporter.listSessions()
		};
		if (endpoint === "events" && typeof payload === "object" && payload !== null && typeof payload.sessionId === "string") return {
			ok: true,
			value: await reporter.listEvents(payload.sessionId)
		};
		return {
			ok: false,
			error: {
				code: "bad-request",
				message: "unknown session reporting endpoint"
			}
		};
	}, { authority: "loopback" }));
	ctx.provide("sessionReporter", reporter);
	ctx.effect(() => async () => {
		await reporter.close();
	}, "dsh-session-reporting");
}
//#endregion
export { DEFAULT_DATABASE_URL, SessionReporter, apply, inject, name, provide, resolveRepository };
