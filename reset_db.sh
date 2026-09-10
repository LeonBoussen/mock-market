#!/usr/bin/env bash
# Reset ALL Mock Market data for a clean test run.
# Deletes every user, profile, position, order, saved simulation and cache.
# The first account created afterwards becomes the admin.
#
# Usage:
#   ./reset_db.sh          # interactive: asks "yes" before wiping
#   ./reset_db.sh --yes    # non-interactive (CI / scripts)
set -euo pipefail
cd "$(dirname "$0")"

exec node scripts/reset-db.js "$@"
