import "@deepseek-ai/dsh-session";
import z from "@deepseek-ai/schemastery";
import "@deepseek-ai/dsh-llm";
import { Readable } from "stream";
import "@deepseek-ai/dsh-subprocess";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import "zod";
import { Context } from "@deepseek-ai/cordis";
import "@modelcontextprotocol/sdk/types.js";
import "zod/v4";
//#region src/claude-provider.d.ts
type ClaudePermissionMode = 'dontAsk' | 'bypassPermissions';
//#endregion
//#region src/codex-provider.d.ts
type CodexPermissionMode = 'never' | 'dangerously-bypass-approvals-and-sandbox';
//#endregion
//#region src/plugin.d.ts
declare const name = "native-agents";
declare const inject: string[];
interface CodexConfig {
  enabled?: boolean;
  env?: Record<string, string>;
  permissionMode?: CodexPermissionMode;
  disposeGraceMs?: number;
}
interface ClaudeConfig {
  enabled?: boolean;
  env?: Record<string, string>;
  permissionMode?: ClaudePermissionMode;
  disposeGraceMs?: number;
}
interface NativeToolsConfig {
  enabled?: boolean;
  subagentProvider?: string;
  maxDepth?: number;
}
/** Deployment configuration for provider homes, permissions, and process release. */
interface Config {
  dshHome?: string;
  storageRoot?: string;
  codex?: CodexConfig;
  claudeCode?: ClaudeConfig;
  nativeTools?: NativeToolsConfig;
}
declare const Config: z<Config>;
/** Register the two persistent native LLM routes. */
declare function apply(ctx: Context, config?: Config): void;
//#endregion
//#region src/binding-store.d.ts
type NativeProvider = string;
interface BindingBase {
  version: 1;
  dshSessionId: string;
  provider: NativeProvider;
  cwd: string;
  createdAt: string;
}
type NativeBinding = BindingBase & ({
  state: 'creating';
  nativeId?: string;
} | {
  state: 'ready';
  nativeId: string;
});
interface CreateBindingInput {
  dshSessionId: string;
  provider: NativeProvider;
  cwd: string;
  nativeId?: string;
}
/** Plugin-owned durable association between one DSH child and one native session. */
declare class BindingStore {
  private readonly root;
  constructor(root: string);
  pathFor(sessionId: string): string;
  read(sessionId: string): Promise<NativeBinding | undefined>;
  create(input: CreateBindingInput): Promise<NativeBinding>;
  markReady(sessionId: string, provider: NativeProvider, nativeId: string): Promise<NativeBinding & {
    state: 'ready';
  }>;
  readReady(sessionId: string, provider: NativeProvider, cwd: string): Promise<NativeBinding & {
    state: 'ready';
  }>;
}
//#endregion
export { BindingStore, Config, type Config as NativeAgentsConfig, type NativeBinding, type NativeProvider, apply, inject, name };