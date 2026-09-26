/**
 * v1-shim.ts — V1→V2 compatibility shim (Wave 0 scaffold)
 *
 * This file is the SOLE ALLOWED V1-pattern exception after the V1-freeze
 * declared in Wave 0. It exists as a passthrough placeholder only.
 *
 * Rules:
 * - No V1 API imports permitted here (no @opencode-ai/plugin/*).
 * - No logic or re-exports of V1 types — this is an empty shell.
 * - Shim removal gate: Wave 10 (run-ci.sh green on V2 + hook-fire +
 *   permissions matrix + parallel-session tests green).
 * - All new code MUST use V2 patterns exclusively.
 *
 * @see .matrixx/plans/opencode-v1-to-v2-migration.md — Compat-shim note
 * @see .matrixx/notepads/opencode-v1-to-v2-migration/decisions.md
 */

export {};
