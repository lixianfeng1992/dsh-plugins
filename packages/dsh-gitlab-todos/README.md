# dsh-gitlab-todos

GitLab Todo polling and a right-side Todo drawer for the DSH Web profile.

## Features

- Stores the Personal Access Token through DSH credentials under `GITLAB_PERSONAL_ACCESS_TOKEN`; the token is never returned to the browser.
- Configures the GitLab domain, defaulting to `https://gitlab.com`; the Host appends `/api/v4/todos` for GitLab.com and self-managed instances.
- Fetches all pending Todos on the Host at startup, on a configurable timer, and on manual refresh.
- Adds a GitLab Todo settings page, sidebar count and right-side drawer to DSH Web.
- Keeps the last successful list visible when a later sync fails.

The PAT needs access to the Todo API. For a read-only prototype, use the narrowest scope accepted by the target GitLab instance, normally `read_api`.

## Build and install

```sh
cd ~/workspace/dsh-plugins
pnpm install
pnpm --filter dsh-gitlab-todos build
pnpm --filter dsh-gitlab-todos pack
pnpm dsh plugin add --profile web ./packages/dsh-gitlab-todos/dist/dsh-gitlab-todos-0.1.3.tgz
```

Open DSH Web settings and select `GitLab Todo`. Enter the GitLab domain and PAT, then choose `保存并同步`.

## Why polling

GitLab documents Todo list and completion REST endpoints, but no Todo-specific project webhook, group webhook, system hook, or public subscription API. Issue, merge request, and comment webhooks can be refresh hints, but they cannot authoritatively report changes to one user's Todo list. Polling `GET /todos?state=pending` is the supported synchronization mechanism.
