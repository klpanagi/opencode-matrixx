import { describe, expect, test } from "bun:test";
import { checkRequiredDeps, getInstallCommand, getPlatform, isBunVersionOk, isOpenCodeVersionOk } from "./deps";

describe("getPlatform", () => {
  test("returns valid platform", () => {
    const p = getPlatform();
    expect(["darwin", "linux", "win32"]).toContain(p);
  });
});

describe("isBunVersionOk", () => {
  test("1.4.0 is ok", () => {
    expect(isBunVersionOk("1.4.0")).toBe(true);
  });
  test("1.3.9 is not ok", () => {
    expect(isBunVersionOk("1.3.9")).toBe(false);
  });
  test("1.4.1 is ok", () => {
    expect(isBunVersionOk("1.4.1")).toBe(true);
  });
  test("2.0.0 is ok", () => {
    expect(isBunVersionOk("2.0.0")).toBe(true);
  });
});

describe("isOpenCodeVersionOk", () => {
  test("1.0.150 is ok", () => {
    expect(isOpenCodeVersionOk("1.0.150")).toBe(true);
  });
  test("1.0.149 is not ok", () => {
    expect(isOpenCodeVersionOk("1.0.149")).toBe(false);
  });
});

describe("checkRequiredDeps", () => {
  test("returns 3 entries", () => {
    const deps = checkRequiredDeps();
    expect(deps).toHaveLength(3);
    expect(deps.map((d) => d.name)).toEqual(["bun", "opencode", "git"]);
  });
});

describe("getInstallCommand", () => {
  test("rtk linux contains curl", () => {
    expect(getInstallCommand("rtk", "linux")).toContain("curl");
  });
  test("rtk darwin contains brew", () => {
    expect(getInstallCommand("rtk", "darwin")).toContain("brew");
  });
  test("headroom darwin contains uv", () => {
    expect(getInstallCommand("headroom", "darwin")).toContain("uv");
  });
  test("headroom linux contains uv", () => {
    expect(getInstallCommand("headroom", "linux")).toContain("uv");
  });
  test("unknown dep returns empty", () => {
    expect(getInstallCommand("unknown-dep", "linux")).toBe("");
  });
});
