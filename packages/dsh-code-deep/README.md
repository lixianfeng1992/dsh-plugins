# dsh-code-deep

Native DeepSeek Harness tools backed by `@team-harness/code-deep`.

Install into a profile with:

```sh
dsh plugin --profile demo add dsh-code-deep
```

The bundle registers `code_deep_explore` and `code_deep_review` through the DSH tools registry. Both tools operate on the calling agent's session workspace (`exec.agent.session.header.cwd`), which must be a Git repository root. Calls without a session workspace fail instead of falling back to the DSH process directory. The plugin caches one client per repository and closes all clients when its Cordis fiber unloads.
