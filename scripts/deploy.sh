#!/bin/bash
set -e
cd /data/data/com.termux/files/home/projects/bfs1

echo "=== BlackFlagStreams CF Pages Deploy Script ==="
echo "Step 1: Installing dependencies..."
npm install --silent 2>&1 | tail -3

echo ""
echo "Step 2: Building production bundle..."
export NODE_ENV=production
npx vite build 2>&1
BUILD_STATUS=$?

if [ $BUILD_STATUS -ne 0 ]; then
  echo "[FAIL] Vite build failed with status $BUILD_STATUS"
  exit 1
fi

echo ""
if [ -d "dist" ]; then
  echo "=== Dist contents ==="
  ls -la dist/
  echo ""
  echo "=== Functions directory ==="
  ls -la src/functions/
fi

echo ""
echo "Build completed successfully. Ready to deploy."
echo ""
echo "--- DEPLOY COMMAND ---"
echo "npx wrangler pages deploy dist --project-name=blackflagstream --branch=main"
echo "---"