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
