/// <reference types="bun-types" />
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeDirForCompare } from "./path-normalize";

describe("normalizeDirForCompare", () => {
  //#given temp sandbox dirs
  const sandbox = join(tmpdir(), `matrixx-normalize-${process.pid}`);
  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  test("treats trailing slash as equivalent", () => {
    //#given paths differing only by trailing slash
    const a = "/a/b/";
    const b = "/a/b";

    //#when normalizing both
    const na = normalizeDirForCompare(a);
    const nb = normalizeDirForCompare(b);

    //#then they compare equal
    expect(na).toBe(nb);
    expect(na).toBe("/a/b");
  });

  test("resolves symlink to realpath", () => {
    //#given a real dir plus a symlink pointing at it
    const real = join(sandbox, "real");
    const link = join(sandbox, "link");
    mkdirSync(real, { recursive: true });
    symlinkSync(real, link);

    //#when normalizing both
    const nReal = normalizeDirForCompare(real);
    const nLink = normalizeDirForCompare(link);

    //#then they compare equal
    expect(nLink).toBe(nReal);
  });

  test("falls back lexically for non-existent path without throwing", () => {
    //#given a path that does not exist
    const missing = `${join(sandbox, "does-not-exist")}/`;

    //#when normalizing
    let result = "";
    const run = (): void => {
      result = normalizeDirForCompare(missing);
    };

    //#then no throw and trailing slash stripped
    expect(run).not.toThrow();
    run();
    expect(result).toBe(join(sandbox, "does-not-exist"));
  });

  test("resolves relative paths against cwd", () => {
    //#given a relative path
    const rel = "some/relative/dir/";

    //#when normalizing
    const result = normalizeDirForCompare(rel);

    //#then resolved to absolute without trailing slash
    expect(result.startsWith("/")).toBe(true);
    expect(result.endsWith("/")).toBe(false);
    expect(result).toBe(normalizeDirForCompare(join(process.cwd(), rel)));
  });

  test("keeps filesystem root intact", () => {
    //#given the root path
    const root = "/";

    //#when normalizing
    const result = normalizeDirForCompare(root);

    //#then root is preserved
    expect(result).toBe("/");
  });
});
