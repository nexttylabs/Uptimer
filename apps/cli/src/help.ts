export function getHelpText(): string {
  return `Uptimer Agent Configuration CLI (uptimer-cli)

A repository-local CLI for coding agents and terminal automation to manage Uptimer
configuration via existing Admin APIs.

USAGE:
  uptimer <resource> <command> [arguments...] [options...]

ENVIRONMENT VARIABLES:
  UPTIMER_URL          Instance origin URL (e.g. https://uptimer.workers.dev or http://localhost:8787).
                       HTTPS required for remote origins. HTTP only allowed on loopback (localhost, 127.0.0.1, [::1]).
                       Must be a root path without query, fragment, or userinfo.
  UPTIMER_ADMIN_TOKEN  Bearer token for Admin API authentication.

COMMANDS:
  monitors
    list [--limit N]                   List monitors (limit 1-200, default 50).
    create --file <file|->             Create a new monitor from JSON payload.
    update <id> --file <file|->        Update an existing monitor (PATCH semantics).
    delete <id>                        Delete a monitor by ID.
    pause <id>                         Pause monitoring for a monitor.
    resume <id>                        Resume monitoring for a monitor.
  monitors groups
    reorder --file <file|->            Reorder monitor groups.
    assign --file <file|->             Assign monitors to a group.

  notification-channels
    list [--limit N]                   List notification channels (limit 1-200, default 50).
    create --file <file|->             Create a notification channel.
    update <id> --file <file|->        Update a notification channel (PATCH semantics).
    delete <id>                        Delete a notification channel by ID.

  status-pages
    list                               List all status pages.
    create --file <file|->             Create a status page.
    update <id> --file <file|->        Update a status page (PATCH semantics).
    delete <id>                        Delete a status page by ID.

  settings
    get                                Retrieve current global settings.
    update --file <file|->             Update global settings (PATCH semantics).
  settings uptime-rating
    get                                Retrieve uptime rating level (1-5).
    update --file <file|->             Update uptime rating level (PUT).

OPTIONS:
  --file <path|->     Path to a UTF-8 JSON file containing the payload object, or '-' for stdin.
  --limit <number>    Max items to return for list operations (1-200, default 50).
  --help, -h          Show this help text without requiring credentials.

PAYLOAD FORMAT:
  All payload inputs via --file must be valid UTF-8 JSON objects.
  PATCH update operations preserve field values; explicit null, false, 0, [], and omissions are respected.

BOUNDED LIST INVENTORY:
  List commands return up to --limit items (1-200, default 50).
  These listings are explicitly bounded slices and do not claim to represent a complete inventory.

PAYLOAD EXAMPLES:
  HTTP Monitor:
    {
      "name": "Production API",
      "type": "http",
      "url": "https://api.example.com/health",
      "method": "GET",
      "interval_seconds": 60,
      "timeout_seconds": 10,
      "expected_status_codes": ["200-299"]
    }

  TCP Monitor:
    {
      "name": "Database Port",
      "type": "tcp",
      "hostname": "db.example.com",
      "port": 5432,
      "interval_seconds": 60,
      "timeout_seconds": 5
    }

  Webhook Notification Channel:
    {
      "name": "Discord Webhook",
      "type": "webhook",
      "config": {
        "url": "https://discord.com/api/webhooks/...",
        "headers": { "Content-Type": "application/json" },
        "payload_template": "{\\"content\\": \\"Monitor $MONITOR_NAME is $STATUS\\"}"
      }
    }

  Telegram Notification Channel:
    {
      "name": "Telegram Alert",
      "type": "telegram",
      "config": {
        "chat_id": "123456789",
        "bot_token_secret_ref": "TELEGRAM_BOT_TOKEN"
      }
    }

  Status Page:
    {
      "title": "Public Status",
      "slug": "main",
      "is_public": true,
      "monitor_ids": [1, 2]
    }

  General Settings:
    {
      "site_title": "Custom Uptimer",
      "retention_days": 90
    }

  Uptime Rating:
    {
      "uptime_rating_level": 4
    }

EXIT CODES & OUTPUT:
  0: Success. Single JSON value printed to stdout followed by newline. (Help is the only human text).
  1: Transport, HTTP, deadline, redirect, or response-contract failure. Emits JSON error envelope to stderr.
  2: Usage, input, local validation, or environment configuration failure. Emits JSON error envelope to stderr.

SECURITY & REDACTION:
  Output is a sanitized/redacted management view; credentials and sensitive keys/payloads
  (such as authorization headers, tokens, passwords, cookies) are replaced with [REDACTED].
  Returned configuration is administrative data and should not be published.
`;
}
