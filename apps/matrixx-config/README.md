# Matrixx Config Studio

Graphical desktop application for editing Matrixx and OpenCode configuration files.

## Monorepo Isolation Rules

This package lives under `apps/matrixx-config/` in the opencode-matrixx monorepo.

| Rule                  | Description                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| **No workspace link** | Independent `package.json`, own lockfile. Not registered in root `package.json` workspaces.     |
| **Schema contract**   | Consumes `dist/matrixx.schema.json` via `scripts/sync-schema.mjs` — never imports `../../src/`. |
| **No root coupling**  | Root `biome.json`, `tsconfig.json`, `.gitignore` do not cover this directory.                   |
| **Separate CI**       | Root CI ignores `apps/`. This app has its own workflow.                                         |

## Prerequisites

- [Bun](https://bun.sh) >= 1.4.0
- [Rust](https://rustup.rs) (stable) — only for Tauri builds
- Matrixx root `bun run build` has been run (generates `dist/matrixx.schema.json`)

## Getting Started

```bash
# Install dependencies
bun install

# Sync the Matrixx schema (must run after Matrixx root build)
bun run sync:schema

# Start dev server
bun run dev
```

## Commands

| Command                 | Description                                                     |
| ----------------------- | --------------------------------------------------------------- |
| `bun run dev`           | Start Vite dev server (port 5173)                               |
| `bun run dev:desktop`   | Guarded Tauri dev (display probe, crash recovery, web fallback) |
| `bun run build:desktop` | Guarded Tauri release build                                     |
| `bun run build`         | Production build (static site)                                  |
| `bun run preview`       | Preview production build                                        |
| `bun run check`         | Type-check with svelte-check                                    |
| `bun run sync:schema`   | Sync Matrixx schema from root `dist/`                           |
| `bun run lint`          | Check formatting                                                |
| `bun run format`        | Format with Prettier                                            |

## Project Structure

```
src/
├── lib/
│   ├── config/       # Config reader, writer, validator, paths
│   ├── store/        # Svelte stores (config, UI, notifications)
│   ├── components/   # UI components
│   │   ├── layout/   # App shell, sidebar, header
│   │   ├── config/   # Field editors (string, number, boolean, etc.)
│   │   ├── presets/  # Preset management
│   │   └── common/   # Shared UI (SearchBar, Toggle, Select, etc.)
│   ├── hooks/        # Custom hooks
│   └── utils/        # JSONC helpers, diff, backup
├── routes/
│   ├── +layout.svelte # App shell with sidebar
│   └── +page.svelte   # Dashboard
├── app.html
└── app.css
```

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
AST-aware modification.

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
| `GET /` → 500 `TypeError: css is not a function` | `@sveltejs/vite-plugin-svelte` v4 does not support Vite 6 (its peer range is `vite ^5`). Keep it at `^5`. |
| `bun run lint` flags `schema.json` / `schema-version.ts` | These are generated — they belong in `.prettierignore`. Re-run `bun run sync:schema` instead of formatting them. |
| Dev server 200 but empty/stale sections | Re-run `bun run sync:schema` — the bundled `schema.json` is older than the root schema. |
| `cargo tauri dev` fails on Linux | Missing WebKit system libs: `sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libgtk-3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev`. |
| Window dies with `Gdk-Message: Error 71 ... Wayland display` | Broken display stack. Use `bun run dev:desktop` (retries via XWayland, else web fallback) or `GDK_BACKEND=x11 cargo tauri dev`. |
| `Failed to create GBM buffer` / black window (VMs, headless GPUs) | `bun run dev:desktop` sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` automatically. Manual: export it before `cargo tauri dev`. |
| `command not found: tauri` | `cargo install tauri-cli --version "^2" --locked`, ensure `~/.cargo/bin` is on `PATH`. |
| App can't find config dir | Override with the `OPENCODE_CONFIG_DIR` env var. |
