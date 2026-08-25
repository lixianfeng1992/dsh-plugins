import z from "@deepseek-ai/schemastery";
import { Context } from "@deepseek-ai/cordis";
//#region src/types.d.ts
interface SkillHubConfig {
  repositoryUrl: string;
  dshHome?: string;
  profile?: string;
}
interface SyncCounts {
  linked: number;
  skipped: number;
  failed: number;
}
interface SyncResult extends SyncCounts {
  repositoryUrl: string;
  checkoutPath: string;
  syncedAt: string;
  errors: string[];
}
interface SkillHubState {
  repositoryUrl: string;
  checkoutPath: string;
  profile: string;
  lastSync?: SyncResult;
  createdLinks: string[];
}
type SkillHubProgress = {
  phase: 'idle';
  operationId?: string;
} | {
  phase: 'validating' | 'cloning' | 'scanning' | 'linking' | 'persisting';
  operationId: string;
  message: string;
} | {
  phase: 'success';
  operationId: string;
  result: SyncResult;
} | {
  phase: 'error';
  operationId: string;
  stage: string;
  message: string;
};
//#endregion
//#region src/plugin.d.ts
declare const name = "dsh-skill-hub";
declare const provide = "skillHub";
declare function apply(ctx: Context, config?: SkillHubConfig): void;
//#endregion
//#region src/sync.d.ts
declare class SkillHubSynchronizer {
  private config;
  private dshHome;
  private profile;
  private statePath;
  private state?;
  private running?;
  private operationId?;
  private progress;
  constructor(config: SkillHubConfig);
  configure(config: SkillHubConfig): void;
  getState(): Promise<SkillHubState>;
  getProgress(operationId?: string): SkillHubProgress;
  /** Starts clone + link initialization and returns immediately with an operation id. */
  startInitialize(repositoryUrl: string, persist: () => Promise<void>): string;
  /** SessionStart is pull-only. It never creates a missing checkout. */
  sync(): Promise<SyncResult>;
  private performInitialize;
  private performPull;
  private scanAndLink;
  private writeState;
}
//#endregion
//#region src/repository.d.ts
interface RepositoryRef {
  url: string;
  name: string;
}
declare function parseRepositoryUrl(input: string): RepositoryRef;
declare function repositoryPaths(dshHome: string, profile: string, ref: RepositoryRef): {
  base: string;
  checkout: string;
  skills: string;
  links: string;
  state: string;
};
//#endregion
export { type RepositoryRef, type SkillHubConfig, type SkillHubProgress, type SkillHubState, SkillHubSynchronizer, type SyncCounts, type SyncResult, apply, name, parseRepositoryUrl, provide, repositoryPaths };