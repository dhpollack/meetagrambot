# MeetAGramBot

A Telegram bot for [MeetAgain](https://meetagain.org) that answers questions about events and groups using Cloudflare Workers AI.

## Features

- `/events` -- browse upcoming events
- `/event <id>` -- event details
- `/groups` -- browse public groups
- `/group <slug>` -- group details
- `/status` -- API health check
- Natural language: ask questions like "when is the next event at Travolta?" and the bot uses AI to figure out what you meant

## Prerequisites

- A [Cloudflare](https://cloudflare.com) account with Workers AI enabled (requires a payment method on file)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- Node.js 24+ and npm

## Setup

0. Create a telegram bot with the @BotFather and create a file called `.dev.vars`:

```
BOT_TOKEN=xxxxxxxx:yyyyyyyyyyyyyyyyyyyyyyyyyyyy
TELEGRAM_SECRET_TOKEN=<a-random-string-you-generate>
```

Generate a random string for `TELEGRAM_SECRET_TOKEN` (e.g. `openssl rand -hex 32`). This prevents unauthorized requests from triggering your webhook.

1. Clone the repo:

```
git clone <repo-url>
cd meetagrambot
```

2. Install dependencies:

```
just setup
```

3. Set your Telegram bot token as a secret (this prints your token to the console):

```
just insert-bot-token
```

Set your secret token as a Cloudflare secret:

```
npx wrangler secret put TELEGRAM_SECRET_TOKEN
```

4. Update `BOT_INFO` in `wrangler.jsonc` with your bot's info. Get it by running, this should be a json string:

```
just get-bot-info
```

5. Deploy your app and get your full cloudflare app url and set it in `.dev.vars` as `MEETAGRAMBOT_CF_URL`:

```
$ just deploy
> meetagrambot@0.0.0 deploy
...
Deployed meetagrambot triggers (5.88 sec)
  https://meetagrambot.<your-cf-subdomain>.workers.dev
```

Then add it to `.dev.vars`

```
BOT_TOKEN=...
TELEGRAM_SECRET_TOKEN=<same-value-from-step-0>
MEETAGRAMBOT_CF_URL=https://meetagrambot.<your-cf-subdomain>.workers.dev
```

6. Set the webhook URL (includes the secret token):

```
just set-bot-webhook-url
```

## Development

```
npm run generate     # generate files from API spec
npm run dev          # start local dev server
npm run deploy       # deploy to Cloudflare Workers
npm run tail         # tail live logs from the deployed worker
npm run types        # regenerate worker-configuration.d.ts after config changes
npm run format       # format code with biome
npm run typecheck    # run typescript typechecker
```

## Configuration

- `wrangler.jsonc` -- Cloudflare Worker config. Contains the AI binding, environment variables, and compatibility flags.
- `.dev.vars` -- local-only secrets (`BOT_TOKEN`). Never committed to git.
- `api/openapi.json` -- OpenAPI spec for the MeetAgain backend. Used to generate the API client.

## Architecture

- `src/index.ts` -- main Telegram bot (grammy framework)
- `src/ai.ts` -- Workers AI integration using the `@cf/ibm-granite/granite-4.0-h-micro` model with tool calling
- `src/api-client/` -- auto-generated HTTP client from the OpenAPI spec

When a user sends a message that is not a `/command`, the bot sends it to Workers AI. The AI can call API tools (`get_events`, `get_groups`, etc.) to look up data, then outputs a command that the bot executes. This lets users ask natural language questions without memorizing commands.

## Pricing

The bot uses `@cf/ibm-granite/granite-4.0-h-micro`, the cheapest available model. Workers AI bills per token. With typical usage the cost is negligible.

# Agents

There is an [AGENTS.md file](./AGENTS.md) that your favorite AI agent can use for more help with this repo that was provided by Cloudflare
