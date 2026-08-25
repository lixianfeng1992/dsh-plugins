# dsh-session-reporting

Reports complete DSH sessions to an independent PostgreSQL database. The existing DSH session persistence backend is untouched. A session is associated with the anonymous harness user and the Git repository resolved from its `cwd`; all turns append to the same `reporting_session_events` stream.

## Local prototype

```sh
docker compose -f packages/dsh-session-reporting/docker-compose.yml up -d
pnpm --filter dsh-session-reporting build
```

The prototype connection string is fixed in `src/index.ts` as `postgresql://dsh:dsh@localhost:5432/dsh_reporting`. Repository identity is stored directly on each session row; sessions outside a Git repository are skipped.
