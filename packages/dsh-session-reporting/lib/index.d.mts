import { Pool, PoolConfig } from "pg";
import { Context } from "@deepseek-ai/cordis";
import { Session, SessionEvent } from "@deepseek-ai/dsh-session";
//#region src/reporter.d.ts
interface SessionReportingConfig {
  readonly connectionString: string;
  readonly userId: string;
}
interface RepositoryBinding {
  readonly canonicalRemote: string;
  readonly rootPath: string;
}
declare function resolveRepository(cwd: string): Promise<RepositoryBinding | undefined>;
declare class SessionReporter {
  private readonly config;
  readonly pool: Pool;
  private readonly tails;
  private readonly repositories;
  private initPromise;
  constructor(config: SessionReportingConfig, poolConfig?: PoolConfig);
  initialize(): Promise<void>;
  private initializeSchema;
  enqueue(session: Session, event: SessionEvent): Promise<void>;
  private append;
  close(): Promise<void>;
  listSessions(): Promise<unknown[]>;
  listEvents(sessionId: string): Promise<unknown[]>;
}
//#endregion
//#region src/index.d.ts
declare const name = "dsh-session-reporting";
declare const provide = "sessionReporter";
declare const inject: string[];
/** Local PostgreSQL endpoint used by the prototype bundle. */
declare const DEFAULT_DATABASE_URL = "postgresql://dsh:dsh@localhost:5432/dsh_reporting";
declare function apply(ctx: Context): void;
//#endregion
export { DEFAULT_DATABASE_URL, type RepositoryBinding, SessionReporter, type SessionReportingConfig, apply, inject, name, provide, resolveRepository };