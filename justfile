set dotenv-load
set dotenv-path := '.dev.vars'

default:
  just -u -l --list-submodules

setup: _download-openapi-spec
  npm install

test:
  npm run typecheck
  npm test

# Re-download the API spec, regenerate the client, and prove the bot still matches it
resync-api: _download-openapi-spec
  npm run generate
  npm run typecheck
  npm test

deploy:
  npm run generate
  npm run deploy

insert-bot-token:
  @echo "BOT_TOKEN: $BOT_TOKEN"
  npx wrangler secret put BOT_TOKEN

get-bot-info:
  @curl "https://api.telegram.org/bot${BOT_TOKEN}/getMe" | jq -Rc .

set-bot-webhook-url:
  @curl "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${MEETAGRAMBOT_CF_URL}&secret_token=${TELEGRAM_SECRET_TOKEN}"

_download-openapi-spec:
  #!/bin/bash
  set -euo pipefail
  etag=""
  if [ -f .openapi-etag ]; then
    etag=$(cat .openapi-etag)
  fi
  headers=$(mktemp)
  code=$(curl -sS -w "%{http_code}" -o /tmp/openapi.json.tmp -D "$headers" \
    ${etag:+-H "If-None-Match: $etag"} \
    https://meetagain.org/api/openapi.json)
  if [ "$code" = "200" ]; then
    new_etag=$(grep -i '^etag:' "$headers" | cut -d' ' -f2- | tr -d '\r')
    echo "$new_etag" > .openapi-etag
    jq 'walk(if type == "object" then del(.operationId) else . end)' /tmp/openapi.json.tmp > api/openapi.json
  elif [ "$code" = "304" ]; then
    echo "file not updated"
  else
    echo "Error: HTTP $code" >&2
    rm "$headers"
    exit 1
  fi
  rm "$headers"

import? '.local.justfile'
