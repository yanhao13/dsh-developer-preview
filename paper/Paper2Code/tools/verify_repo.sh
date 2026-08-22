#!/usr/bin/env bash
# Verify the generated TypeScript repository: typecheck, build, and test.
# Usage: bash tools/verify_repo.sh [repo_dir]
set -e
REPO_DIR="${1:-../outputs/Cordis_repo}"
cd "$REPO_DIR"

echo "===== npm install ====="
npm install --no-audit --no-fund --silent 2>&1 | tail -3 || true

if [ -f package.json ]; then
  echo "===== scripts ====="
  node -e "const p=require('./package.json'); console.log(JSON.stringify(p.scripts||{}, null, 2))"
fi

echo "===== tsc --noEmit ====="
if [ -f tsconfig.json ]; then
  npx --no-install tsc --noEmit 2>&1 | head -60 || echo "(tsc reported errors above)"
else
  echo "no tsconfig.json"
fi

echo "===== vitest run (if configured) ====="
if grep -q '"test"' package.json 2>/dev/null; then
  npx --no-install vitest run --reporter=basic 2>&1 | tail -40 || echo "(vitest reported failures above)"
fi

echo "===== node main.ts (if present) ====="
if [ -f main.ts ]; then
  npx --no-install tsx main.ts 2>&1 | head -30 || echo "(main.ts failed above)"
fi
echo "===== verify done ====="
