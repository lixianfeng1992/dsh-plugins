# dsh-native-agents

Continuable Codex and Claude Code agents for DeepSeek Harness. DSH owns child identity, FIFO delivery, `send_message`, interruption, and its visible transcript. The plugin keeps DSH-to-native bindings under `~/.dsh/native-agents` by default while Codex and Claude Code retain their native histories in `~/.codex` and `~/.claude`.

The bundle adds two continuable tools:

- `codex_agent`
- `claude_code_agent`

Both children have no DSH tools. Their native products execute tools and preserve native history. Follow-up messages use DSH's existing `send_message` tool.

The plugin resolves the locally installed `codex` and `claude` commands from `PATH`, matching Paseo's provider model. It reuses each CLI's existing authentication and does not provide executable path overrides. The tarball bundles the Claude Agent SDK JavaScript but excludes its optional platform executables because the SDK is always pointed at the local `claude`. Only conversations created and bound by this plugin are continuable; it does not import or guess existing CLI conversations.

## Local installation

Build and pack from the `dsh-plugins` workspace:

```sh
pnpm --filter dsh-native-agents build
pnpm --filter dsh-native-agents pack
```

Install the generated archive from the DeepSeek Harness workspace, matching the other local plugins:

```sh
pnpm dsh plugin add --profile web /Users/allenli/workspace/dsh-plugins/packages/dsh-native-agents/dist/dsh-native-agents-0.1.2.tgz
pnpm dsh web --no-open
```

## Configuration

The default configuration enables both providers in unattended safe modes:

```yaml
- id: native-agents
  name: dsh-native-agents
  config:
    storageRoot: /absolute/path/to/native-agent-state
    codex:
      permissionMode: never
    claudeCode:
      permissionMode: dontAsk
```

`storageRoot` defaults to `<DSH_HOME>/native-agents` and contains only binding records. Native transcripts and authentication remain in the CLIs' standard homes. Credentials may also be supplied explicitly through each provider's `env` configuration.

Automatic DSH LLM retry is disabled for both routes. Missing, corrupt, or incomplete bindings fail without creating a replacement conversation.
