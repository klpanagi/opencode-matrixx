#!/usr/bin/env node
/**
 * Desktop launch guard for Matrixx Config Studio.
 *
 * Wraps `cargo tauri dev` / `cargo tauri build` with pre-flight checks and a
 * crash supervisor, so a broken graphics stack produces a clear diagnosis
 * (and a working fallback) instead of a raw Gdk/Wayland crash:
 *
 *   1. Tauri CLI present?  (else: install hint)
 *   2. App icons generated? (else: regenerate via `cargo tauri icon`)
 *   2b. Stale vite on :5173? (reap only this app's orphans, else clear error)
 *   3. Display probed?      (Wayland socket connect / X TCP connect)
 *   3b. WebKit software path (WEBKIT_DISABLE_DMABUF_RENDERER unless overridden)
 *   4. Supervised launch:   watches stderr for display-crash signatures for
 *      30s after start; on crash it kills the process group and recovers:
 *        crash on Wayland + live X  -> retry once with GDK_BACKEND=x11
 *        otherwise                  -> fall back to web mode (`bun run dev`),
 *                                      or exit non-zero with --strict
 *
 * Usage:
 *   node scripts/dev-desktop.mjs [dev|build] [--strict]
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import net from "node:net";

const mode = process.argv[2] === "build" ? "build" : "dev";
const strict = process.argv.includes("--strict");
const root = join(import.meta.dirname, "..");
const srcTauri = join(root, "src-tauri");
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: "pipe", encoding: "utf8", ...opts }).trim();

const fail = (msg) => {
  console.error(`\n[dev-desktop] ERROR: ${msg}\n`);
  process.exit(1);
};
const info = (msg) => console.log(`[dev-desktop] ${msg}`);

// --- 1. Tauri CLI -----------------------------------------------------------
try {
  run("cargo", ["tauri", "--version"], { cwd: root });
} catch {
  fail(
    "Tauri CLI not found. Install it once with:\n" +
      '  cargo install tauri-cli --version "^2" --locked\n' +
      "and ensure ~/.cargo/bin is on your PATH.",
  );
}

// --- 2. App icons ------------------------------------------------------------
const requiredIcons = [
  "32x32.png",
  "128x128.png",
  "128x128@2x.png",
  "icon.icns",
  "icon.ico",
];
const iconsDir = join(srcTauri, "icons");
const missing = requiredIcons.filter((f) => !existsSync(join(iconsDir, f)));
if (missing.length > 0) {
  const source = join(iconsDir, "icon.png");
  if (!existsSync(source)) {
    fail(
      `Missing app icons (${missing.join(", ")}) and no ${source} to regenerate from.\n` +
        "Provide a 1024x1024 PNG as src-tauri/icons/icon.png, then re-run.",
    );
  }
  info(`Regenerating missing icons (${missing.join(", ")})...`);
  try {
    run("cargo", ["tauri", "icon", source], { cwd: srcTauri });
  } catch (e) {
    fail(`Icon generation failed:\n${e.stdout ?? e.message}`);
  }
}

// --- 2b. Stale dev servers ---------------------------------------------------
// `cargo tauri dev` spawns the frontend (beforeDevCommand) outside the process
// group we can kill, so a previous guarded run can leave `vite dev` holding
// :5173 and the next launch fails with "Port 5173 is already in use".
// Reap only vite processes whose command line points at THIS app directory.
const DEV_PORT = 5173;
// Vite v6 may bind ::1, 127.0.0.1, or both — probe both families.
async function portBusy(port) {
  const probe = (host) =>
    new Promise((resolve) => {
      const s = net.createConnection(port, host);
      s.on("connect", () => {
        s.end();
        resolve(true);
      });
      s.on("error", () => resolve(false));
    });
  const [v4, v6] = await Promise.all([probe("127.0.0.1"), probe("::1")]);
  return v4 || v6;
}
async function reapStaleVite() {
  if (!(await portBusy(DEV_PORT))) return;
  info(
    `Port ${DEV_PORT} is busy — looking for stale vite processes of this app...`,
  );
  let killed = [];
  for (const pid of readdirSync("/proc").filter((d) => /^\d+$/.test(d))) {
    try {
      const cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(
        /\0/g,
        " ",
      );
      if (/vite/.test(cmd) && cmd.includes(root)) {
        process.kill(Number(pid), "SIGKILL");
        killed.push(pid);
      }
    } catch {
      /* raced exit / no permission — ignore */
    }
  }
  if (killed.length === 0) {
    fail(
      `Port ${DEV_PORT} is occupied by an unrelated process.\n` +
        `Stop it or set a different port, then re-run.`,
    );
  }
  info(`Stopped stale vite processes (${killed.join(", ")}).`);
  for (let i = 0; i < 10 && (await portBusy(DEV_PORT)); i++) {
    await new Promise((r) => setTimeout(r, 500));
  }
  if (await portBusy(DEV_PORT))
    fail(`Port ${DEV_PORT} is still busy after cleanup. Aborting.`);
}
if (mode === "dev") await reapStaleVite();

// --- 3. Display probes -------------------------------------------------------
const probeSocket = (path, timeoutMs = 2000) =>
  new Promise((resolve) => {
    const s = net.createConnection(path);
    const done = (ok) => {
      s.destroy();
      resolve(ok);
    };
    s.on("connect", () => done(true));
    s.on("error", () => done(false));
    setTimeout(() => done(false), timeoutMs);
  });

const probeTcp = (port, host = "127.0.0.1", timeoutMs = 2000) =>
  new Promise((resolve) => {
    const s = net.createConnection(port, host);
    const done = (ok) => {
      s.destroy();
      resolve(ok);
    };
    s.on("connect", () => done(true));
    s.on("error", () => done(false));
    setTimeout(() => done(false), timeoutMs);
  });

const waylandDisplay = process.env.WAYLAND_DISPLAY;
const waylandSocketPath = waylandDisplay
  ? waylandDisplay.startsWith("/")
    ? waylandDisplay
    : join(process.env.XDG_RUNTIME_DIR ?? "/run/user/1000", waylandDisplay)
  : null;
const xDisplay = process.env.DISPLAY;
const xDisplayNum = xDisplay ? parseInt(xDisplay.split(":")[1], 10) : NaN;

const waylandLive = waylandSocketPath
  ? await probeSocket(waylandSocketPath)
  : false;
const xLive = !isNaN(xDisplayNum) ? await probeTcp(6000 + xDisplayNum) : false;

if (waylandLive)
  info(`Wayland socket ${waylandSocketPath} accepts connections.`);
else if (waylandDisplay)
  info(`WAYLAND_DISPLAY=${waylandDisplay} set but socket unreachable.`);
if (xLive) info(`X display ${xDisplay} accepts connections.`);

// --- 4. Supervised launch ----------------------------------------------------
const CRASH_PATTERNS = [
  /cannot open display/i,
  /dispatching to .* display/i, // Gdk-Message: Error 71 (Protocol error) ...
  /failed to initialize .*(gtk|gdk|wayland|x11|display|egl|gl|gbm|dmabuf)/i,
  /failed to create gbm buffer/i, // WebKitGTK without DRI/DMA-BUF (VMs, odd GPUs)
  /no .* (display|graphics|render node|gpu) (found|available)/i,
  /wl_display/i,
];
const WATCH_MS = 30000;

function killGroup(child) {
  try {
    if (child.pid) process.kill(-child.pid, "SIGKILL");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

function launchTauri(extraEnv, attempt) {
  return new Promise((resolve) => {
    info(
      `Running: cargo tauri ${mode}${attempt > 1 ? ` (attempt ${attempt})` : ""}`,
    );
    const child = spawn("cargo", ["tauri", mode], {
      cwd: root,
      stdio: ["inherit", "inherit", "pipe"],
      detached: true,
      env: { ...process.env, ...extraEnv },
    });
    let watching = true;
    let settled = false;
    let crashed = false;
    const settle = (outcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
    const stopWatch = setTimeout(() => {
      watching = false;
      child.stderr.removeAllListeners("data");
    }, WATCH_MS);
    child.stderr.on("data", (buf) => {
      process.stderr.write(buf);
      if (!watching) return;
      const text = buf.toString();
      if (CRASH_PATTERNS.some((re) => re.test(text))) {
        watching = false;
        crashed = true;
        clearTimeout(stopWatch);
        info("Display crash signature detected — stopping Tauri processes.");
        killGroup(child);
      }
    });
    child.on("exit", (code) => {
      clearTimeout(stopWatch);
      if (crashed) settle("display-crash");
      else settle(code === 0 ? "ok" : `exit-${code ?? "signal"}`);
    });
    const forward = (sig) => {
      try {
        killGroup(child);
      } catch {
        /* noop */
      }
      if (sig === "SIGINT" || sig === "SIGTERM") process.exit(130);
    };
    process.on("SIGINT", forward);
    process.on("SIGTERM", forward);
  });
}

function launchWeb() {
  info("Falling back to web mode (bun run dev → http://localhost:5173).");
  const web = spawn("bun", ["run", "dev"], { cwd: root, stdio: "inherit" });
  web.on("exit", (code) => process.exit(code ?? 0));
  process.on("SIGINT", () => web.kill("SIGINT"));
  process.on("SIGTERM", () => web.kill("SIGTERM"));
}

const noDisplayMsg =
  "No working graphical display detected (Wayland socket and X display both unreachable).\n" +
  "The Tauri window cannot open on a headless/broken graphics stack — environmental, not an app bug.";

let extraEnv = {};
if (!waylandLive && xLive) {
  info("Wayland unusable but X is live — using XWayland (GDK_BACKEND=x11).");
  extraEnv = { GDK_BACKEND: "x11" };
}
// WebKitGTK DMA-BUF renderer fails without DRI (VMs, headless GPUs, odd drivers)
// with "Failed to create GBM buffer". Force the Cairo/software path for this
// lightweight config UI — negligible perf cost, major compatibility win.
// Respects an explicit user override.
if (!process.env.WEBKIT_DISABLE_DMABUF_RENDERER) {
  info(
    "Disabling WebKit DMA-BUF renderer (software path — avoids GBM failures on VMs).",
  );
  extraEnv.WEBKIT_DISABLE_DMABUF_RENDERER = "1";
}

// Attempt 1: native (or XWayland if Wayland is already known-dead).
// Attempt 2 (dev only): if we crashed and haven't tried X yet and X is live, retry via XWayland.
let outcome = await launchTauri(extraEnv, 1);
if (
  outcome === "display-crash" &&
  mode === "dev" &&
  !extraEnv.GDK_BACKEND &&
  xLive
) {
  info("Retrying via XWayland (GDK_BACKEND=x11).");
  outcome = await launchTauri({ GDK_BACKEND: "x11" }, 2);
}

if (outcome === "display-crash") {
  if (mode !== "dev" || strict) {
    fail(
      `${noDisplayMsg}${strict ? "\nRe-run without --strict to fall back to web mode." : ""}`,
    );
  }
  launchWeb();
} else if (outcome !== "ok") {
  fail(
    `cargo tauri ${mode} ended with ${outcome} (no display-crash signature — see output above).`,
  );
}
