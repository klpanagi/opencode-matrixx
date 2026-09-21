# Matrixx Config Studio — Setup & Build Guide

> Canonical documentation lives with the code: `apps/matrixx-config/README.md`.
> This page is a pointer. The app is an **isolated package** (own `package.json`,
> own lockfile, own CI workflow `.github/workflows/config-app.yml`); root
> `bun install`, typecheck, lint, and CI ignore it.

Graphical desktop app (Tauri v2 + SvelteKit + Svelte 5 + Tailwind + Zod) for
editing Matrixx and OpenCode configuration files.

- Setup, commands, schema contract, and troubleshooting:
  [`apps/matrixx-config/README.md`](../apps/matrixx-config/README.md)
- Related: `configurations.md` (the schema the app edits),
  `cli-guide.md` (the `install`/`doctor` CLI).
