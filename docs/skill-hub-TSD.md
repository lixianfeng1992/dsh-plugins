# dsh-skill-hub TSD

Status: implementing

## 1. Summary

`dsh-skill-hub` is a dsh plugin that synchronizes a team Git repository and exposes its repository-level skills to dsh through symbolic links.

The first version is configured from a dedicated `Skill Hub` page in the dsh web settings sidebar. The user provides one repository URL. Saving initializes the repository immediately: the Host half clones it under `DSH_HOME`, scans the repository's root `skills/` directory, links each skill into dsh's user skill directory, and then persists the setting through the `skill-hub` settings namespace. Later `SessionStart` events update an existing checkout with `git pull`; they never perform the initial clone.

## 2. Scope

### In scope

- Configure one team repository URL from the web UI.
- Show `Skill Hub` as its own item in the Web settings sidebar.
- Render a repository URL input, save action, sync status, and latest result on that page.
- Support GitHub and GitLab repository URLs.
- Detect the source type from the URL; the user does not select a provider.
- Clone or update the repository under `DSH_HOME`.
- Use the active dsh profile as a repository directory prefix.
- Scan only the repository root `skills/` directory.
- Create symbolic links from discovered skills into `DSH_HOME/skills`.
- Skip a link when its destination already exists.
- Let the existing dsh filesystem skill provider discover linked skills.

### Out of scope

- Configurable branch or skill subdirectory.
- Manual provider selection.
- Skill conflict resolution or replacement.
- Deleting existing user skills.
- Team repository write operations.
- Webhooks, merge request integration, or review workflows.
- Code knowledge graph and learning recall.
- Cross-platform fallback when symbolic-link creation is unavailable.

## 3. Configuration

The first version exposes only one setting:

```ts
interface SkillHubConfig {
  repositoryUrl: string
}
```

The plugin resolves GitHub and GitLab behavior from `repositoryUrl`. Credentials are resolved through dsh's credential mechanism or the host Git credential helper; credentials are not stored in the plugin configuration.

The dedicated Web settings page should provide:

- Repository URL input.
- Save action that initializes the repository and reports completion only after clone and link processing succeed.
- Live stage status while Save is running.
- Last successful sync time.
- Counts for linked, skipped, and failed skills.
- A human-readable error when clone, update, validation, or link creation fails.

## 4. Filesystem layout

The repository is stored below the dsh home:

```text
$DSH_HOME/
├── skill-hub/
│   └── repos/
│       └── <profile>-<repo>/
│           └── skills/
│               └── <skill-name>/
│                   └── SKILL.md
└── skills/
    └── <skill-name> -> ../skill-hub/repos/<profile>-<repo>/skills/<skill-name>
```

`<profile>` is the active dsh profile, such as `web` or `headless`. `<repo>` is the repository name parsed from the URL.

The repository directory must be resolved beneath:

```text
$DSH_HOME/skill-hub/repos
```

The plugin must reject a repository name or derived path that escapes this directory.

## 5. Skill discovery contract

The repository must contain skills in this form:

```text
<repository-root>/skills/<skill-name>/SKILL.md
```

The plugin scans immediate children of `skills/`. It does not treat the repository root as a skill root and does not recursively search arbitrary directories.

dsh already scans `$DSH_HOME/skills` and follows skill symlinks. The plugin therefore does not need to modify the skill provider or add a new discovery protocol.

## 6. Synchronization behavior

Repository initialization runs from the Web settings save action. Incremental updates run from the `agent/session-start` hook. Plugin loading itself never performs repository I/O.

The save flow is:

1. Validate the configured URL and derive the repository directory.
2. Clone the repository into a temporary directory and atomically move it into place.
3. Scan `<checkout>/skills/*/SKILL.md`.
4. For each valid skill, create `$DSH_HOME/skills/<skill-name>` as a symbolic link.
5. Persist `repositoryUrl` only after clone and link processing complete successfully.
6. Record the initialization result for the settings surface. A failure leaves the previous saved URL and checkout unchanged so the user can retry Save.

The Host publishes each save stage as it begins. The Web client must render the latest stage without waiting for the complete save operation:

```ts
type SkillHubProgress =
  | { phase: 'idle' }
  | { phase: 'validating'; message: '正在验证仓库地址…' }
  | { phase: 'cloning'; message: '正在克隆仓库…' }
  | { phase: 'scanning'; message: '正在扫描 Skills…' }
  | { phase: 'linking'; message: '正在创建链接…' }
  | { phase: 'persisting'; message: '正在保存配置…' }
  | { phase: 'success'; result: SyncResult }
  | { phase: 'error'; stage: string; message: string }
```

Progress is stage-based. The plugin must not parse Git stderr to synthesize clone percentages. A newly opened settings page reads the current progress snapshot before subscribing, so it does not appear idle while an operation is already running.

The `SessionStart` flow is:

1. Silently return when no repository URL is configured.
2. Resolve the checkout for the configured URL.
3. Run `git pull --ff-only` only when that checkout already exists and is a Git repository.
4. Never clone a missing checkout from `SessionStart`; record a recoverable error that directs the user to save the repository again.
5. Rescan skills and create links for newly added skills after a successful pull.
6. Record the update result without blocking session startup.

Link handling is intentionally conservative:

- A missing destination is linked.
- An existing file, directory, or symbolic link is skipped.
- Existing destinations are never overwritten.
- A failed link does not abort links for other skills.
- Repository update failure preserves the previous checkout and existing links.

The result reports at least:

```text
linked: <number>
skipped: <number>
failed: <number>
```

## 7. Web client integration

The package contains both Host and browser halves:

```text
src/index.ts          # Host entry
src/client/index.ts   # Web entry
```

The package exports `./client` and declares `dsh.client` with `platform: web`. The browser half registers a `settings.section` entry with id `skill-hub`, binds the `skill-hub` settings scope, and invokes the Host initialization action when the user saves. It writes `repositoryUrl` through the settings mutation API only after initialization succeeds. It must be built as the dsh lazy client-module factory (`lib/client.js`).

While Save is running, the page disables the repository input and Save button and displays the current Host stage beside the action. Success displays linked, skipped, and failed counts. Failure displays the failing stage and a human-readable message, leaves the draft URL intact, and re-enables Save for retry. Progress text uses an `aria-live="polite"` region.

The page does not require changes to the dsh Web application. The client module registry discovers the enabled package from its `dsh.client` declaration.

## 8. Runtime integration

The implementation should use existing dsh extension points:

- A settings provider for persisted `repositoryUrl`.
- A `skill-hub` settings namespace for persisted configuration.
- The Web client settings section described above.
- The filesystem or subprocess capability for Git operations, according to the host-side plugin conventions.
- The existing skill filesystem provider for discovery after links are created.
- A Host action invoked by the Web client for clone and initial link creation on Save.
- A plugin-owned progress snapshot and subscription channel used by the Web client during Save.
- The `agent/session-start` lifecycle hook for pull-only updates of an existing checkout.

The plugin must not modify the agent loop. Skill discovery remains owned by dsh's existing skill capability.

## 9. State and ownership

The plugin should maintain repository metadata under:

```text
$DSH_HOME/skill-hub/state.json
```

The state records the configured URL, resolved checkout path, active profile, last sync result, and plugin-created links.

The link list is required so future cleanup can remove only links created by `dsh-skill-hub`. The first version does not remove links automatically, but it must retain enough ownership information for a later cleanup feature.

## 10. Safety requirements

- Never log access tokens or credential helper output.
- Never execute repository-provided scripts during synchronization.
- Validate repository paths before clone, update, scan, and link operations.
- Accept only directories containing a regular `SKILL.md` file as skills.
- Do not follow arbitrary symlinks outside the checkout when scanning repository skills.
- Do not replace an existing destination in `$DSH_HOME/skills`.
- Use a temporary checkout or lock when synchronization can run concurrently.
- Keep the previous usable checkout when an update fails.

## 11. Acceptance criteria

- Saving a GitHub repository clones it under `$DSH_HOME/skill-hub/repos/<profile>-<repo>` before the UI reports success.
- Saving a GitLab repository follows the same path and behavior.
- Save displays validating, cloning, scanning, linking, and persisting stages as the Host reaches them.
- Save disables duplicate submission while initialization is running.
- A successful Save displays linked, skipped, and failed counts.
- A failed Save identifies the failed stage, preserves the entered URL, and can be retried.
- `SessionStart` pulls an existing checkout and never performs the initial clone.
- A missing checkout at `SessionStart` does not block session startup and is not cloned implicitly.
- A repository skill at `skills/example/SKILL.md` is linked to `$DSH_HOME/skills/example`.
- dsh discovers the linked skill without changes to the existing skill provider.
- An existing `$DSH_HOME/skills/example` is left unchanged and reported as skipped.
- A malformed repository URL produces a visible settings error.
- A failed clone leaves the previous saved URL and checkout unchanged and keeps Save retryable.
- A failed pull leaves the existing checkout and previous links usable.
- Credentials do not appear in persisted settings, logs, or sync results.
- The Web settings sidebar contains a `Skill Hub` item.
- Opening `Skill Hub` shows the repository URL input and saves through the `skill-hub` settings namespace.
- A missing or empty URL leaves the sidebar page usable and does not log or perform sync work.
