set dotenv-load

default:
  just -u -l --list-submodules

import? '.local.justfile'
