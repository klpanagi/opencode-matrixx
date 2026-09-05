import { PLATFORM_INSTALL_COMMANDS } from "./constants";
import { BUN_REQUIRED, type DepStatus, OPENCODE_MIN, type Platform } from "./types";

function parseVer(v: string): number[] {
  const cleaned = v.replace(/^v/, "").split("-")[0] ?? "";
  return cleaned.split(".").map((n) => parseInt(n, 10) || 0);
}

function gte(found: string, required: string): boolean {
  const a = parseVer(found);
  const b = parseVer(required);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return true;
}

export function isBunVersionOk(found: string): boolean {
  return gte(found, BUN_REQUIRED);
}

export function isOpenCodeVersionOk(found: string): boolean {
  return gte(found, OPENCODE_MIN);
}

export function getPlatform(): Platform {
  const p = process.platform;
  if (p === "darwin" || p === "win32") return p;
  return "linux";
}

export function getInstallCommand(dep: string, platform: Platform): string {
  const entry = PLATFORM_INSTALL_COMMANDS[dep];
  if (!entry) return "";
  return entry[platform] ?? entry.all ?? "";
}

function bunDepStatus(): DepStatus {
  const ver = typeof Bun !== "undefined" ? Bun.version : undefined;
  const hint = getInstallCommand("bun", getPlatform()) || PLATFORM_INSTALL_COMMANDS.bun?.all || "";
  if (!ver) {
    return { name: "bun", required: true, found: false, installHint: hint };
  }
  return {
    name: "bun",
    required: true,
    found: isBunVersionOk(ver),
    version: ver,
    installHint: isBunVersionOk(ver) ? "" : `Bun ${ver} < ${BUN_REQUIRED} — ${hint}`,
  };
}

function gitDepStatus(): DepStatus {
  const hint = getInstallCommand("git", getPlatform()) || PLATFORM_INSTALL_COMMANDS.git?.all || "";
  let found = false;
  let version: string | undefined;
  try {
    const which = Bun.which("git");
    if (which) {
      found = true;
      try {
        const r = Bun.spawnSync(["git", "--version"], { stdout: "pipe", stderr: "pipe", timeout: 3000 });
        if (r.exitCode === 0) version = r.stdout.toString().trim();
      } catch {}
    }
  } catch {}
  return { name: "git", required: true, found, version, installHint: found ? "" : hint };
}

function opencodeDepStatus(): DepStatus {
  const hint = getInstallCommand("opencode", getPlatform()) || PLATFORM_INSTALL_COMMANDS.opencode?.all || "";
  let found = false;
  let version: string | undefined;
  try {
    const r = Bun.spawnSync(["opencode", "--version"], { stdout: "pipe", stderr: "pipe", timeout: 3000 });
    const out = `${r.stdout.toString()}${r.stderr.toString()}`.trim();
    const m = out.match(/(\d+\.\d+\.\d+(?:-[\w.]+)?)/);
    if (m?.[1]) {
      version = m[1];
      found = isOpenCodeVersionOk(version);
    } else if (r.exitCode === 0 && out) {
      version = out.split("\n")[0]?.trim();
      found = version ? isOpenCodeVersionOk(version) : false;
    }
    if (!found && r.exitCode !== 0) {
      const which = Bun.which("opencode");
      if (which) {
        found = false;
        version = which;
      }
    }
  } catch {
    try {
      const which = Bun.which("opencode");
      if (which) {
        found = false;
        version = which;
      }
    } catch {}
  }
  const installHint = found ? "" : version ? `Found ${version} < ${OPENCODE_MIN} — ${hint}` : hint;
  return { name: "opencode", required: true, found, version, installHint };
}

export function checkRequiredDeps(): DepStatus[] {
  return [bunDepStatus(), opencodeDepStatus(), gitDepStatus()];
}

function checkOneOptional(name: string): DepStatus {
  const hint = getInstallCommand(name, getPlatform());
  let found = false;
  let version: string | undefined;
  try {
    const which = Bun.which(name === "ast-grep" ? "ast-grep" : name);
    if (which) {
      found = true;
      try {
        const bin = name === "ast-grep" ? "ast-grep" : name;
        const r = Bun.spawnSync([bin, "--version"], { stdout: "pipe", stderr: "pipe", timeout: 3000 });
        if (r.exitCode === 0) version = r.stdout.toString().trim().split("\n")[0]?.trim();
        else version = which;
      } catch {
        version = which;
      }
    }
  } catch {}
  if (name === "dcp") {
    try {
      const which = Bun.which("opencode-dcp");
      if (which) {
        found = true;
        version = which;
      }
    } catch {}
  }
  return { name, required: false, found, version, installHint: found ? "" : hint };
}

export function checkOptionalDeps(): DepStatus[] {
  return ["headroom", "rtk", "dcp", "gitleaks", "ast-grep", "playwright"].map(checkOneOptional);
}

export function formatDepReport(statuses: DepStatus[]): string {
  const lines: string[] = [];
  for (const s of statuses) {
    const icon = s.found ? "✓" : s.required ? "✗" : "○";
    const ver = s.version ? ` ${s.version}` : "";
    const req = s.required ? " (required)" : " (optional)";
    lines.push(`${icon} ${s.name}${ver}${req} — ${s.found ? "found" : "missing"}`);
    if (!s.found && s.installHint) lines.push(`  → ${s.installHint}`);
  }
  return lines.join("\n");
}
