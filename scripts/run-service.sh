#!/usr/bin/env bash
# Start Mock Market as a detached service with auto-restart.
# Logs go to /tmp/mm-server.log; stop with: scripts/stop-service.sh
set -u
cd "$(dirname "$0")/.."

PORT="${PORT:-4280}"
LOG="${MM_LOG:-/tmp/mm-server.log}"
PIDFILE="${MM_PIDFILE:-/tmp/mm-server.pid}"

stop_old() {
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "stopping existing service pid $(cat "$PIDFILE")"
    kill "$(cat "$PIDFILE")" 2>/dev/null
    sleep 1
  fi
  # safety net: kill any leftover server on our port pattern
  pkill -f "node server/index[.]js" 2>/dev/null
  sleep 0.5
  rm -f "$PIDFILE"
}

stop_old

# Fully detached supervisor: restarts the app if it ever crashes.
setsid bash -c '
  cd "'"$PWD"'"
  echo "Mock Market service starting on :'"$PORT"'" >> "'"$LOG"'"
  while :; do
    PORT="'"$PORT"'" node server/index.js >> "'"$LOG"'" 2>&1 &
    APP_PID=$!
    echo $APP_PID > "'"$PIDFILE"'"
    wait $APP_PID
    code=$?
    echo "[service] server exited (code $code) — restarting in 2s" >> "'"$LOG"'"
    sleep 2
  done
' < /dev/null > /dev/null 2>&1 &
SUPER_PID=$!
disown 2>/dev/null || true

sleep 1.5
echo "service supervisor pid: $SUPER_PID"
echo "log: $LOG   pidfile: $PIDFILE"
