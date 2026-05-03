set dotenv-load
set dotenv-path := '.dev.vars'

default:
  just -u -l --list-submodules

setup: _download-openapi-spec
  npm install

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
  curl https://meetagain.org/api/openapi.json | jq . > api/openapi.json

import? '.local.justfile'
