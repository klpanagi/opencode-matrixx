import { join } from "node:path";
import { getOpenCodeConfigDir } from "../../shared/opencode-config-dir";
import type { Platform } from "./types";

export const REQUIRED_DEPS = ["bun", "opencode", "git"] as const;
export const OPTIONAL_DEPS = ["headroom", "rtk", "dcp", "gitleaks", "ast-grep", "playwright"] as const;

function dcpInstallHint(): string {
  const dir = getOpenCodeConfigDir({ binary: "opencode" });
  return `npm install @tarquinen/opencode-dcp --prefix ${dir}  (or: npm install -g @tarquinen/opencode-dcp)`;
}

export type InstallCommandMap = Record<string, Record<Platform | "all", string> | Record<string, string>>;

export const PLATFORM_INSTALL_COMMANDS: Record<string, Partial<Record<Platform | "all", string>>> = {
  headroom: {
    darwin: "uv tool install headroom-ai[all]  # or: pipx install headroom-ai[all]",
    linux: "uv tool install headroom-ai[all]  # or: pipx install headroom-ai[all]",
    win32: "pipx install headroom-ai[all]  # or: pip install headroom-ai[all]",
  },
  rtk: {
    darwin: "brew install rtk-ai/tap/rtk",
    linux: "curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/main/install.sh | bash",
    win32: "cargo install rtk  # or: npm install -g rtk",
  },
  dcp: {
    all: dcpInstallHint(),
  },
  gitleaks: {
    darwin: "brew install gitleaks",
    linux: "curl -sfL https://raw.githubusercontent.com/gitleaks/gitleaks/master/install.sh | bash",
    win32: "winget install gitleaks  # or: choco install gitleaks",
    all: "go install github.com/gitleaks/gitleaks/v8@latest",
  },
  "ast-grep": {
    darwin: "brew install ast-grep",
    linux: "cargo install ast-grep  # or: npm install -g @ast-grep/cli",
    win32: "cargo install ast-grep  # or: npm install -g @ast-grep/cli",
    all: "npm install -g @ast-grep/cli",
  },
  playwright: {
    darwin: "npx playwright install  # or: bunx playwright install",
    linux: "npx playwright install  # or: bunx playwright install",
    win32: "npx playwright install  # or: bunx playwright install",
    all: "npx playwright install",
  },
  opencode: {
    all: "npm install -g opencode  # or: bun install -g opencode  |  https://opencode.ai/docs",
  },
  bun: {
    all: "curl -fsSL https://bun.sh/install | bash  # https://bun.sh",
  },
  git: {
    all: "https://git-scm.com/downloads",
  },
};

export function getDcpInstallHint(): string {
  return dcpInstallHint();
}

export function configDirHint(): string {
  return getOpenCodeConfigDir({ binary: "opencode" });
}

export function dcpPluginDirHint(): string {
  return join(getOpenCodeConfigDir({ binary: "opencode" }), "node_modules", "@tarquinen", "opencode-dcp");
}
