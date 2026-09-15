#!/usr/bin/env bash
# Quick start for PID.
#   ./install.sh            install deps if needed, then launch the dev build (hot reload)
#   ./install.sh --app      build a packaged PID.app, copy it to /Applications, and open it
#   ./install.sh --check    only verify prerequisites
set -euo pipefail
cd "$(dirname "$0")"

mode="dev"
case "${1:-}" in
  --app) mode="app" ;;
  --check) mode="check" ;;
  -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
  "") ;;
  *) echo "unknown option: $1" >&2; exit 2 ;;
esac

# package.json pins pnpm 12.4.1; an older pnpm on PATH downloads and re-execs it
# instead of resolving with its own (incompatible) lockfile semantics.
export npm_config_manage_package_manager_versions=true

ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$*"; exit 1; }

echo "PID prerequisites"
command -v node >/dev/null || fail "node not found (need ≥ 22.19): brew install node"
node_major=$(node -p 'process.versions.node.split(".")[0]')
[ "$node_major" -ge 22 ] && ok "node $(node --version)" || fail "node $(node --version) is too old, need ≥ 22.19"

command -v pnpm >/dev/null || fail "pnpm not found: npm i -g pnpm"
pnpm_version=$(pnpm --version 2>/dev/null) || fail "pnpm --version failed: $(pnpm --version 2>&1 | tail -3)"
pinned=$(node -p 'require("./package.json").packageManager.split("@")[1].split("+")[0]')
[ "$pnpm_version" = "$pinned" ] && ok "pnpm $pnpm_version" \
  || fail "pnpm resolved to $pnpm_version, package.json pins $pinned — install pnpm ≥ 10 so it can self-manage the pinned version"

if command -v pi >/dev/null; then
  ok "pi $(pi --version 2>/dev/null | head -1) at $(command -v pi)"
else
  warn "pi not on PATH — optional: PID runs its pinned runtime itself, a terminal pi only matters for TUI round-trips"
fi

want=$(node -p 'require("./package.json").dependencies["@earendil-works/pi-coding-agent"]')
have=$(pi --version 2>/dev/null | head -1 || true)
if [ -n "$have" ] && [ "$want" != "$have" ]; then
  warn "installed pi is $have, PID's pinned runtime is $want — keep them equal (see AGENTS.md)"
fi

if [ ! -d node_modules ] || [ package.json -nt node_modules/.modules.yaml ]; then
  echo "Installing dependencies"
  pnpm install --frozen-lockfile || {
    warn "frozen install failed, retrying without --frozen-lockfile (pnpm-lock.yaml may change)"
    pnpm install
  }
fi
ok "dependencies ready"

[ "$mode" = "check" ] && exit 0

if [ "$mode" = "app" ]; then
  echo "Building PID.app"
  pnpm dist
  app=release/mac-arm64/PID.app
  [ -d "$app" ] || fail "build produced no $app"
  rm -rf /Applications/PID.app
  cp -R "$app" /Applications/PID.app
  ok "installed /Applications/PID.app"

  # `open` on a running app only brings it forward: the running instance keeps the old build and
  # its live sessions, which is the point — installing must never interrupt work in progress.
  # Say when the new build takes effect instead of restarting anything.
  if pgrep -f "/Applications/PID.app/Contents/MacOS/PID" >/dev/null 2>&1; then
    warn "a PID is running — it keeps the old build until you quit and reopen it"
  else
    open /Applications/PID.app
  fi
  exit 0
fi

echo "Starting dev build (Electron + hot reload). Ctrl+C to stop."
exec pnpm dev
