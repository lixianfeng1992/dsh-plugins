import z from "@deepseek-ai/schemastery";
import { Context } from "@deepseek-ai/cordis";
//#region src/types.d.ts
/** Runtime configuration persisted through DSH settings. */
interface GitLabTodosConfig {
  gitlabDomain: string;
  pollIntervalSeconds: number;
}
/** Stable Todo fields exposed to the Web client. */
interface GitLabTodo {
  id: number;
  actionName: string;
  targetType: string;
  targetTitle: string;
  targetUrl: string;
  projectName?: string;
  projectUrl?: string;
  authorName?: string;
  authorAvatarUrl?: string;
  createdAt: string;
}
type GitLabTodosStatus = 'unconfigured' | 'idle' | 'syncing' | 'ready' | 'error';
/** Browser-safe snapshot. Credential values are never included. */
interface GitLabTodosState {
  status: GitLabTodosStatus;
  todos: GitLabTodo[];
  lastSyncedAt?: string;
  error?: string;
  revision: number;
}
//#endregion
//#region src/plugin.d.ts
declare const name = "dsh-gitlab-todos";
declare const provide = "gitLabTodos";
declare const inject: string[];
declare const SETTINGS_NAMESPACE = "gitlab-todos";
declare const TOKEN_REF: import("@deepseek-ai/dsh-credentials").CredentialRef;
declare const DEFAULT_CONFIG: GitLabTodosConfig;
declare const Config: z<Schemastery.ObjectS<{
  gitlabDomain: z<string, string>;
  pollIntervalSeconds: z<number, number>;
}>, Schemastery.ObjectT<{
  gitlabDomain: z<string, string>;
  pollIntervalSeconds: z<number, number>;
}>>;
/** Register GitLab Todo polling, settings and loopback RPC. */
declare function apply(ctx: Context, config?: Partial<GitLabTodosConfig>): void;
//#endregion
//#region src/gitlab.d.ts
interface FetchTodosOptions {
  domain: string;
  token: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}
/** Validate and normalize one GitLab API Todo. */
declare function parseGitLabTodo(value: unknown): GitLabTodo;
/** Fetch every pending Todo using page-size termination. */
declare function fetchPendingTodos(options: FetchTodosOptions): Promise<GitLabTodo[]>;
//#endregion
//#region src/sync.d.ts
interface GitLabTokenProvider {
  resolve(): Promise<string | undefined>;
}
interface GitLabTodosSynchronizerOptions {
  tokenProvider: GitLabTokenProvider;
  fetchTodos?: typeof fetchPendingTodos;
  now?: () => Date;
}
/** Owns polling state and coalesces overlapping refresh requests. */
declare class GitLabTodosSynchronizer {
  private config;
  private readonly tokenProvider;
  private readonly fetchTodos;
  private readonly now;
  private inFlight?;
  private state;
  constructor(config: GitLabTodosConfig, options: GitLabTodosSynchronizerOptions);
  configure(config: GitLabTodosConfig): void;
  getState(): GitLabTodosState;
  refresh(): Promise<GitLabTodosState>;
  /** Wait for an older operation, then run against the latest config and credential. */
  refreshAfterCurrent(): Promise<GitLabTodosState>;
  private runRefresh;
}
//#endregion
export { Config, DEFAULT_CONFIG, type GitLabTodo, type GitLabTodosConfig, type GitLabTodosState, type GitLabTodosStatus, GitLabTodosSynchronizer, type GitLabTodosSynchronizerOptions, type GitLabTokenProvider, SETTINGS_NAMESPACE, TOKEN_REF, apply, fetchPendingTodos, inject, name, parseGitLabTodo, provide };