# dsh-skill-hub

Synchronizes the root `skills/` directory of one GitHub or GitLab repository into the active DSH profile with symbolic links.

The plugin registers the `skill-hub` settings namespace and a Web client section, so dsh web shows a dedicated `Skill Hub` item in the Settings sidebar with a repository URL form. It accepts `{ repositoryUrl, dshHome?, profile? }` as its config. `dshHome` follows dsh's standard resolution: explicit config, then `DSH_HOME`, then `~/.dsh`; `profile` defaults to `DSH_PROFILE` or `web`. It exposes a `skillHub` service with `sync()` and `getState()` methods. Credentials are delegated to Git and are never persisted.
