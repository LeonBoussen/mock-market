#!/usr/bin/env bash
# Mock Market — start the full stack, killing any stale instances first.
#
#   Backend  (Express API)  : http://127.0.0.1:4280   (API_PORT)
#   Frontend (Vite dev UI)  : http://127.0.0.1:5173   (WEB_PORT, proxies /api → 4280)
#
# Usage:
#   ./startup.sh
#   API_PORT=5000 ./startup.sh
set -euo pipefail
cd "$(dirname "$0")"

API_PORT="${API_PORT:-${PORT:-4280}}"
WEB_PORT="${WEB_PORT:-5173}"
LOG="${MM_LOG:-/tmp/mm-server.log}"
WEB_LOG="${MM_WEB_LOG:-/tmp/mm-web.log}"
PIDDIR="${MM_RUNDIR:-/tmp}"

# ---- 1) kill ONLY this app's running instances ------------------------------
# A process that is SIGSTOP'd never handles SIGTERM, so escalate to SIGKILL.
kill_pat() {
  local pat="$1" name="$2"
  local pids
  pids="$(pgrep -f "$pat" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "→ stopping existing $name (pids: $(echo $pids | tr '\n' ' '))"
    kill $pids 2>/dev/null || true
    sleep 1
    pids="$(pgrep -f "$pat" 2>/dev/null || true)"
    if [ -n "$pids" ]; then
      kill -9 $pids 2>/dev/null || true
    fi
  fi
}
kill_pat 'server/index[.]js' 'API server'
kill_pat 'client/vite.config[.]js' 'frontend (Vite)'
rm -f "$PIDDIR/mm-server.pid" "$PIDDIR/mm-web.pid"
sleep 0.5

# ---- 2) dependencies -------------------------------------------------------
if [ ! -d node_modules ]; then
  echo "→ installing dependencies (npm install)…"
  npm install
fi

# ---- 3) start backend (auto-restarting) ------------------------------------
echo "→ starting backend API on :$API_PORT…"
setsid bash -c '
  cd "'"$PWD"'"
  while :; do
    PORT="'"$API_PORT"'" node server/index.js >> "'"$LOG"'" 2>&1 &
    APP_PID=$!
    echo $APP_PID > "'"$PIDDIR"'/mm-server.pid"
    wait $APP_PID
    echo "[service] backend exited (code $?) — restarting in 2s" >> "'"$LOG"'"
    sleep 2
  done
' < /dev/null > /dev/null 2>&1 &
disown 2>/dev/null || true

# ---- 4) start frontend (Vite) ---------------------------------------------
echo "→ starting frontend (Vite) on :$WEB_PORT…"
setsid bash -c '
  cd "'"$PWD"'"
  npx vite --config client/vite.config.js --port "'"$WEB_PORT"'" --host >> "'"$WEB_LOG"'" 2>&1 &
  echo $! > "'"$PIDDIR"'/mm-web.pid"
  wait $!
' < /dev/null > /dev/null 2>&1 &
disown 2>/dev/null || true

# ---- 5) health check + print URLs ------------------------------------------
LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"

echo ""
echo "→ waiting for backend API…"
ok=0
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${API_PORT}/api/health" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 0.5
done

if [ "$ok" != "1" ]; then
  echo "⚠️  backend API did not become healthy — check $LOG" >&2
  tail -20 "$LOG" >&2 || true
  exit 1
fi

echo ""
echo "✅ Mock Market started"
echo "   Backend  API : http://127.0.0.1:${API_PORT}"
echo "   Frontend UI  : http://127.0.0.1:${WEB_PORT}"
if [ -n "$LAN_IP" ]; then
  echo "   LAN           : http://${LAN_IP}:${API_PORT} (api)  ·  http://${LAN_IP}:${WEB_PORT} (ui)"
fi
echo "   logs          : $LOG  ·  $WEB_LOG"
echo "   stop          : bash scripts/stop-service.sh"
