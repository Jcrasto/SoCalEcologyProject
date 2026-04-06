#!/usr/bin/env bash
# dev.sh — starts backend (uv + uvicorn) and frontend (npm/vite) with separate log files
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"

BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

cleanup() {
  echo ""
  echo "Stopping servers..."
  kill "$BACKEND_PID" "$FRONTEND_PID" "$TAIL_PID" 2>/dev/null || true
  wait "$BACKEND_PID" "$FRONTEND_PID" "$TAIL_PID" 2>/dev/null || true
  echo "Done."
}
trap cleanup EXIT INT TERM

# ── Backend ──────────────────────────────────────────────────────────────────
echo "Starting backend  → logs/$(basename "$BACKEND_LOG")"
cd "$SCRIPT_DIR/apps/api"
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8009 \
  > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
cd "$SCRIPT_DIR"

# ── Frontend ─────────────────────────────────────────────────────────────────
echo "Starting frontend → logs/$(basename "$FRONTEND_LOG")"
npm --prefix "$SCRIPT_DIR/apps/web" run dev \
  > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

echo ""
echo "  Backend:  http://localhost:8009  (pid $BACKEND_PID)"
echo "  Frontend: http://localhost:5174  (pid $FRONTEND_PID)"
echo ""
echo "  tail -f logs/backend.log"
echo "  tail -f logs/frontend.log"
echo ""
echo "Press Ctrl+C to stop both."

# Tail both logs to the terminal so you can see live output
tail -f "$BACKEND_LOG" "$FRONTEND_LOG" &
TAIL_PID=$!

# Wait until either server exits (bash 3.2-compatible polling loop)
while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
  sleep 1
done
