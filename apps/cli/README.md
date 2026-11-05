# Uptimer CLI

Manage monitors, notification channels, status pages, and global settings through the Uptimer Admin API. Requires Node.js >=22.14.0.

## Install

After the first npm release:

```sh
npm install --global uptimer-cli
uptimer --help
```

To run a pinned version without a global install:

```sh
npx --yes uptimer-cli@<version> --help
```

## Connect

Set `UPTIMER_URL` to the instance origin, such as `https://your-worker.workers.dev`, without `/api/v1`. Supply `UPTIMER_ADMIN_TOKEN` through the invoking process environment or your agent credential configuration. No credential file is created and `.env` is not loaded automatically. HTTPS is required except for explicit loopback HTTP development origins.

```sh
uptimer settings get
uptimer monitors list --limit 20
uptimer status-pages list
```

Write commands accept a UTF-8 JSON object using `--file path.json` or `--file -` for stdin. Payloads use the existing Admin API fields. For example:

```sh
printf '%s\n' '{"name":"API","type":"http","target":"https://api.example.com/health","interval_sec":60}' | uptimer monitors create --file -
```

Successful commands write JSON to stdout. Errors write JSON to stderr and exit with 1 for request failures or 2 for local input/configuration failures. Help exits with 0. Monitor and notification-channel lists are bounded to 50 items by default, or 1–200 with `--limit`; they are not complete exports.

The Admin Token has full management permissions. Treat all returned configuration as administrative data and keep it out of shared logs. A failed or timed-out write may already have reached the server; query before retrying.

## Develop and release

From the repository root:

```sh
pnpm --filter uptimer-cli start --help
pnpm --filter uptimer-cli test
pnpm --filter uptimer-cli test:package
pnpm changeset
```

See [CLI release maintenance](https://github.com/nexttylabs/Uptimer/blob/master/docs/cli-releases.md) for the version PR, npm publishing, and GitHub Release workflow.
