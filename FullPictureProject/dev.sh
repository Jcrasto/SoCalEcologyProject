#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── API ──────────────────────────────────────────────────────────
echo "Starting API..."
cd "$ROOT/apps/api"
if [ ! -d ".venv" ]; then
  echo "  Creating Python venv..."
  uv venv
fi
source .venv/bin/activate
uv pip install fastapi "uvicorn[standard]" duckdb pandas pyarrow httpx python-dotenv pydantic pydantic-settings --quiet
uvicorn main:app --reload --port 8000 &
API_PID=$!

# ── Web ──────────────────────────────────────────────────────────
echo "Starting Web..."
cd "$ROOT/apps/web"
if [ ! -d "node_modules" ]; then
  echo "  Installing npm packages (first run — this takes a minute)..."
  npm install
fi
npm run dev &
WEB_PID=$!

trap "kill $API_PID $WEB_PID 2>/dev/null; exit 0" EXIT INT TERM

echo ""
echo "  API:  http://localhost:8000"
echo "  Web:  http://localhost:5173"
echo "  Docs: http://localhost:8000/docs"
echo ""
wait
