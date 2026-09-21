#!/usr/bin/env bash
#
# A PID that nobody can see.
#
# An agent testing PID has three problems the repo's dev hooks do not solve:
#
#   1. `pnpm dev` shows a window. `PID_DUMP_DIR` hides it, but only at `app.whenReady()` — by then
#      the stock Electron has already put an icon in the Dock and taken focus off whatever the
#      person at the machine was doing. That is the popup, even though no window ever appears.
#   2. PID's own data lives in one userData directory, so a test run writes settings, state and
#      open sessions over the ones the real window is using.
#   3. A packaged `PID.app` shares its bundle id with an installed one, so launching it can bring
#      up the installed copy instead — with the user's real sessions in it.
#
# So: an Electron shell of our own (`LSUIElement`, its own bundle id, ad-hoc signed), a userData
# directory under the sandbox root, and a scratch folder to be the cwd. Nothing it does can reach
# the installed PID, and nothing it draws can reach the screen.
#
#   scripts/sandbox.sh --prompt "say ok"          launch, foreground, print the dump on exit
#   scripts/sandbox.sh --detach --open /tmp/x     launch, come back straight away
#   scripts/sandbox.sh --kill                     stop this sandbox's processes
#   scripts/sandbox.sh --clean                    stop, then delete the sandbox root
#
# Everything the window painted lands in $ROOT/dump (window.txt, window.json, menu.txt), written
# at 5s, 10s, 15s, 25s, 40s and 60s — the same dump a `PID_DUMP_DIR` run produces.
set -euo pipefail

ROOT="${PID_SANDBOX_ROOT:-/tmp/pid-sandbox}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHELL_APP="$ROOT/PIDHeadless.app"
SHELL_BUNDLE_ID="dev.pid.headless"
STAMP="$ROOT/.shell-stamp"

detach=0
build=1
mode=run
open_dir=""
page=""
prompt_text=""
follow_up=""
session=""
search=""

die() { echo "sandbox: $*" >&2; exit 1; }

# Pi files a session under ~/.pi/agent/sessions/<cwd with every '/' turned into '-'>, wrapped in
# '--'. A run whose cwd is inside the sandbox therefore leaves one folder in the real session
# list, and `--clean` is the thing that takes it back out.
sessions_dir_for() {
  local escaped
  escaped="--$(printf '%s' "$1" | sed 's|^/||' | tr '/' '-')--"
  printf '%s' "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/sessions/$escaped"
}

# Only this sandbox's processes: the shell path is unique to the root, so nothing else matches.
kill_sandbox() {
  pkill -f "$SHELL_APP/Contents/MacOS/" 2>/dev/null || true
  sleep 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --open) open_dir="${2:?--open needs a directory}"; shift 2 ;;
    --page) page="${2:?--page needs a value}"; shift 2 ;;
    --prompt) prompt_text="${2:?--prompt needs text}"; shift 2 ;;
    --follow-up) follow_up="${2:?--follow-up needs text}"; shift 2 ;;
    --session) session="${2:?--session needs a file}"; shift 2 ;;
    --search) search="${2:?--search needs text}"; shift 2 ;;
    --detach) detach=1; shift ;;
    --no-build) build=0; shift ;;
    --kill) mode=kill; shift ;;
    --clean) mode=clean; shift ;;
    -h|--help) sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

if [ "$mode" = kill ]; then kill_sandbox; echo "sandbox stopped"; exit 0; fi
if [ "$mode" = clean ]; then
  kill_sandbox
  # Only what this sandbox made: the scratch cwd's own session folder, never the agent's sessions.
  # `--open` may point outside the sandbox, so the folder is read back from the record the launch
  # wrote, and a root from before that record falls back to its own scratch folder.
  recorded="$(cat "$ROOT/open-dir" 2>/dev/null || true)"
  for d in "$recorded" "$ROOT/folder"; do
    [ -n "$d" ] && rm -rf "$(sessions_dir_for "$d")"
  done
  rm -rf "$ROOT"
  echo "sandbox removed: $ROOT"
  exit 0
fi

# --- the shell ------------------------------------------------------------------------------------
#
# macOS decides which app is in front, and whether an app is allowed to notify, from the bundle it
# is launched from — not from the code inside it. `LSUIElement` is what makes it an agent: no Dock
# icon, no focus stolen, no window that could ever be shown.
shell_source() {
  # The Electron the repo actually installed, so the shell matches the pinned version.
  local cand
  for cand in "$REPO"/node_modules/.pnpm/electron@*/node_modules/electron/dist/Electron.app; do
    [ -d "$cand" ] && { echo "$cand"; return 0; }
  done
  return 1
}

make_shell() {
  local src="$1"
  local key
  key="$(stat -f '%m-%z' "$src/Contents/MacOS/Electron" 2>/dev/null || echo none)"
  if [ -d "$SHELL_APP" ] && [ "$(cat "$STAMP" 2>/dev/null)" = "$key" ]; then return 0; fi

  echo "sandbox: building the headless shell (once per Electron version)…" >&2
  rm -rf "$SHELL_APP"
  mkdir -p "$ROOT"
  ditto "$src" "$SHELL_APP"

  local plist="$SHELL_APP/Contents/Info.plist"
  plutil -replace CFBundleIdentifier -string "$SHELL_BUNDLE_ID" "$plist"
  plutil -replace CFBundleName -string PIDHeadless "$plist"
  plutil -replace CFBundleDisplayName -string PIDHeadless "$plist"
  # Agent: no Dock icon, no focus, before `app.whenReady()` can do anything about it.
  plutil -replace LSUIElement -bool true "$plist" 2>/dev/null ||
    plutil -insert LSUIElement -bool true "$plist"
  # The helper bundles carry their own identifiers; leaving them is fine (they are never in front),
  # but they must be re-signed with the copy or the seal is broken.
  codesign --force --deep --sign - --identifier "$SHELL_BUNDLE_ID" "$SHELL_APP" 2>/dev/null ||
    die "could not sign the shell"
  echo "$key" > "$STAMP"
}

# --- run ------------------------------------------------------------------------------------------

# A previous run of this sandbox, whatever it was doing. `kill_sandbox` matches the shell's own
# path, so the installed PID and the repo's own `pnpm dev` are both untouched.
kill_sandbox

mkdir -p "$ROOT/dump" "$ROOT/folder"

if [ "$build" = 1 ]; then
  ( cd "$REPO" && npx electron-vite build >"$ROOT/build.log" 2>&1 ) ||
    { tail -20 "$ROOT/build.log" >&2; die "build failed"; }
fi

if [ "$(uname)" = Darwin ]; then
  src="$(shell_source)" || die "no Electron under node_modules — run pnpm install"
  make_shell "$src"
  bin="$SHELL_APP/Contents/MacOS/Electron"
else
  # No LSUIElement elsewhere; PID_HEADLESS is the whole of it there.
  bin="$REPO/node_modules/.bin/electron"
fi

[ -z "$open_dir" ] && open_dir="$ROOT/folder"
mkdir -p "$open_dir"
# Remembered so --clean can take this run's session folder out of the real session list, wherever
# `--open` pointed.
printf '%s' "$open_dir" > "$ROOT/open-dir"

rm -rf "$ROOT/dump"; mkdir -p "$ROOT/dump"

# A window that is never shown still runs the renderer, so the dump is written either way — but
# only when the probe is on, which is what tells App.tsx to publish it.
export PID_HEADLESS=1
export PID_DUMP_DIR="$ROOT/dump"
export PID_OPEN_FOLDER="$open_dir"
[ -n "$page" ] && export PID_PAGE="$page"
[ -n "$prompt_text" ] && export PID_PROMPT="$prompt_text"
[ -n "$follow_up" ] && export PID_FOLLOWUP="$follow_up"
[ -n "$session" ] && export PID_OPEN_SESSION="$session"
[ -n "$search" ] && export PID_SEARCH="$search"

# PID's own state goes here, never to ~/Library/Application Support/pid.
args=(--user-data-dir="$ROOT/userdata")

echo "sandbox: root    $ROOT"
echo "sandbox: dump    $ROOT/dump"
echo "sandbox: cwd     $open_dir"
echo "sandbox: state   $ROOT/userdata"
echo "sandbox: pi sessions  $(sessions_dir_for "$open_dir")"
echo "sandbox: logs    $ROOT/app.log"

if [ "$detach" = 1 ]; then
  nohup "$bin" "$REPO" "${args[@]}" >"$ROOT/app.log" 2>&1 &
  echo "$!" > "$ROOT/app.pid"
  echo "sandbox: started pid $(cat "$ROOT/app.pid") — stop it with scripts/sandbox.sh --kill"
  exit 0
fi

# Foreground: the caller sees the exit, and nothing is left behind.
trap 'kill_sandbox' EXIT INT TERM
"$bin" "$REPO" "${args[@]}" 2>&1 | tee "$ROOT/app.log"
