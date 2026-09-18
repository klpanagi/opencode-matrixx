# Matrixx Config Studio — Setup & Build Guide

Graphical desktop app for editing Matrixx and OpenCode configuration files.
Lives at `apps/matrixx-config/` in this monorepo as an **isolated package**:
own `package.json`, own lockfile, not registered in root workspaces, own CI
workflow (`.github/workflows/config-app.yml`). Root `bun install`,
typecheck, lint, and CI ignore it.

Stack: Tauri v2 + SvelteKit (adapter-static) + Svelte 5 + Tailwind + Zod.

## Prerequisites

| Requirement | Version | Needed for |
|-------------|---------|------------|
| [Bun](https://bun.sh) | >= 1.4.0 | Everything (install, dev, build, check) |
| [Rust](https://rustup.rs) (stable) | any recent | Tauri desktop builds only |
| Tauri CLI v2 | `^2` | `cargo tauri dev` / `cargo tauri build` |
| Matrixx root build | — | Generates `dist/matrixx.schema.json` (schema contract, see below) |

Linux desktop builds additionally need WebKit system libs (same list CI uses):

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev \
  librsvg2-dev patchelf libgtk-3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev
```

## Quick Start — Web Mode (no Rust needed)

The app runs as a plain web app with a `fetch` fallback for config file
access, so colleagues can use it without installing Rust or Tauri.

```bash
cd apps/matrixx-config

# Install dependencies (first time only)
bun install

# Pull the Matrixx config schema (required before dev/build;
# re-run whenever the root Matrixx config schema changes)
bun run sync:schema

# Start dev server → http://localhost:5173
bun run dev
```

## Desktop Mode — Tauri

One-time Tauri CLI setup (Rust must be installed first):

```bash
cargo install tauri-cli --version "^2" --locked
```

Then, from `apps/matrixx-config/` — prefer the guarded launcher (it checks
the Tauri CLI, regenerates missing icons, probes the display, and supervises
the window process):

```bash
bun run dev:desktop      # guarded cargo tauri dev (+ web fallback, see below)
bun run build:desktop    # guarded cargo tauri build
```

Raw commands (`bun run build && cargo tauri dev`) also work after the first
build — `src-tauri/tauri.conf.json` wires `beforeDevCommand`/`beforeBuildCommand`. Bundle targets: `dmg` (macOS), `msi`
(Windows), `appimage` (Linux). Output lands in
`src-tauri/target/release/bundle/`.

## Commands

Run from `apps/matrixx-config/`.

| Command | Description |
|---------|-------------|
| `bun run dev` | Vite dev server (port 5173) |
| `bun run dev:desktop` | Guarded Tauri dev: CLI/icon checks, display probe, 30s crash supervisor, web fallback |
| `bun run build:desktop` | Guarded Tauri release build (same pre-flight checks, no fallback) |
| `bun run build` | Production static build → `build/` (embedded by Tauri) |
| `bun run preview` | Preview the production build |
| `bun run check` | Type-check (`svelte-kit sync` + `svelte-check`) — must show 0 errors |
| `bun run lint` | Prettier check |
| `bun run format` | Prettier write |
| `bun run sync:schema` | Copy root `dist/matrixx.schema.json` → `src/lib/config/schema.json` + version stamp |

## Schema Contract with Matrixx Root

The app never imports `../../src/`. Its only link to Matrixx is the generated
JSON Schema:

1. Change a Zod schema under root `src/config/schema/`.
2. Run root `bun run build:schema` → regenerates `dist/matrixx.schema.json`.
3. Run `bun run sync:schema` in `apps/matrixx-config/` → refreshes the
   app's local `schema.json` + `schema-version.ts` (warns on version skew).

Generated files (`src/lib/config/schema.json`, `src/lib/config/schema-version.ts`)
are excluded from Prettier via `.prettierignore` — do not hand-edit them.

## Config Files Managed

The app reads/writes the user's real config files (never the repo's):

| OS | Location |
|----|----------|
| Linux | `~/.config/opencode/` (or `$OPENCODE_CONFIG_DIR`) |
| macOS | `~/Library/Application Support/ai.opencode.desktop/` |
| Windows | `%APPDATA%/ai.opencode.desktop/` |

Files: `matrixx.jsonc` (Matrixx plugin settings) and `opencode.jsonc`
(OpenCode native settings). Writes validate first, rotate numbered `.bak`
backups (keeps last 3, restorable), and preserve JSONC comments via
AST-aware modification. In web mode a Tauri-invoke → `fetch` fallback chain
handles file access; in desktop mode native Rust commands (`read_config`,
`write_config`, `resolve_paths`) do it.

## Verification Checklist

```bash
cd apps/matrixx-config
bun run sync:schema   # schema.json ~149 KB, version matches root package.json
bun run check         # svelte-check found 0 errors
bun run lint          # All matched files use Prettier code style!
bun run build         # static output in build/
bun run dev           # http://localhost:5173 returns 200, no errors in log
```

CI (`.github/workflows/config-app.yml`, path-filtered to
`apps/matrixx-config/**`) runs `check` plus full Tauri builds on
Linux/macOS/Windows. Root CI never touches `apps/`.

## Troubleshooting

| Symptom | Cause / Fix |
|---------|-------------|
| `GET /` → 500 `TypeError: css is not a function` | `@sveltejs/vite-plugin-svelte` v4 does not support Vite 6 (its peer range is `vite ^5`). Keep it at `^5`. If you see this after a fresh install, check `bun pm ls` for a v4 resolution and upgrade. |
| `bun run lint` flags `schema.json` / `schema-version.ts` | These are generated — they belong in `.prettierignore`. Re-run `bun run sync:schema` instead of formatting them. |
| Dev server 200 but empty/stale sections | Re-run `bun run sync:schema` — the bundled `schema.json` is older than the root schema. |
| `cargo tauri dev` fails on Linux | Missing WebKit system libs — install the `apt-get` list under Prerequisites. |
| Window dies with `Gdk-Message: Error 71 ... Wayland display` | Broken display stack (socket exists but compositor unreachable). Use `bun run dev:desktop` — it detects the crash signature, retries via XWayland when X is live, else falls back to web mode. Manual override: `GDK_BACKEND=x11 cargo tauri dev`. |
| `Failed to create GBM buffer` / black window (VMs, headless GPUs) | WebKit DMA-BUF renderer needs DRI. `bun run dev:desktop` sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` automatically (software path). Manual: export it before `cargo tauri dev`. |
| `command not found: tauri` | Tauri CLI not installed — `cargo install tauri-cli --version "^2" --locked`, ensure `~/.cargo/bin` is on `PATH`. |
| App can't find config dir | Override with the `OPENCODE_CONFIG_DIR` env var. |
