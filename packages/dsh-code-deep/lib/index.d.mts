import { ToolExecution } from "@deepseek-ai/dsh-tools";
import { CodeDeepClient } from "@team-harness/code-deep";
import { Context } from "@deepseek-ai/cordis";
//#region src/plugin.d.ts
declare const name = "dsh-code-deep";
declare const inject: string[];
declare function apply(ctx: Context): void;
//#endregion
//#region src/clients.d.ts
declare class ProjectClientCache {
  private readonly clients;
  get(projectPath: string): Promise<CodeDeepClient>;
  close(): Promise<void>;
}
//#endregion
//#region src/explore-tool.d.ts
declare function createExploreTool(clients: ProjectClientCache): import("@deepseek-ai/dsh-tools").ToolDefinition;
//#endregion
//#region src/review-tool.d.ts
declare function createReviewTool(clients: ProjectClientCache): import("@deepseek-ai/dsh-tools").ToolDefinition;
//#endregion
//#region src/session-cwd.d.ts
declare function sessionCwd(exec: ToolExecution): string;
//#endregion
export { ProjectClientCache, apply, createExploreTool, createReviewTool, inject, name, sessionCwd };