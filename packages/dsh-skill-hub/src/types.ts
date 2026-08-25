export interface SkillHubConfig { repositoryUrl: string; dshHome?: string; profile?: string }
export interface SyncCounts { linked: number; skipped: number; failed: number }
export interface SyncResult extends SyncCounts { repositoryUrl: string; checkoutPath: string; syncedAt: string; errors: string[] }
export interface SkillHubState { repositoryUrl: string; checkoutPath: string; profile: string; lastSync?: SyncResult; createdLinks: string[] }

export type SkillHubProgress =
  | { phase: 'idle'; operationId?: string }
  | { phase: 'validating' | 'cloning' | 'scanning' | 'linking' | 'persisting'; operationId: string; message: string }
  | { phase: 'success'; operationId: string; result: SyncResult }
  | { phase: 'error'; operationId: string; stage: string; message: string }
