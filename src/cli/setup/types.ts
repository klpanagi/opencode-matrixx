export type Platform = "darwin" | "linux" | "win32";

export type DepStatus = {
  name: string;
  required: boolean;
  found: boolean;
  version?: string;
  installHint: string;
};

export type SetupState = {
  taskSystem: boolean;
  headroom: { enabled: boolean; proxyUrl?: string; project?: string };
  rtk: { enabled: boolean; binaryPath?: string };
  dcp: { enabled: boolean };
  contextMode: boolean;
};

export const BUN_REQUIRED = "1.4.0";
export const OPENCODE_MIN = "1.0.150";
