#!/usr/bin/env bash
# Stop the Mock Market service started by run-service.sh
set -u
PIDFILE="${MM_PIDFILE:-/tmp/mm-server.pid}"

if [ -f "$PIDFILE" ]; then
  PID=$(cat "$PIDFILE")
  echo "stopping server pid $PID"
  kill "$PID" 2>/dev/null
  # also stop the app node process if still around
  sleep 0.5
  kill -0 "$PID" 2>/dev/null && kill -9 "$PID" 2>/dev/null
  rm -f "$PIDFILE"
fi
pkill -f "node server/index[.]js" 2>/dev/null
echo "done"
