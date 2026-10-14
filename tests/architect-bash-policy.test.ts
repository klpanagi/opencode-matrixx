/// <reference types="bun-types" />
import { describe, test, expect } from "bun:test"
import {
  splitCommands,
  unwrapWrapper,
  classifyBashCommand,
} from "../src/hooks/architect/bash-command-policy"

describe("splitCommands", () => {
  test("splits on && operator", () => {
    //#given
    const cmd = "pytest && git status"
    //#when
    const parts = splitCommands(cmd)
    //#then
    expect(parts).toEqual(["pytest", "git status"])
  })

  test("splits on semicolon and pipe operators", () => {
    //#given
    const cmd = "ls; cat foo | grep bar"
    //#when
    const parts = splitCommands(cmd)
    //#then
    expect(parts).toEqual(["ls", "cat foo", "grep bar"])
  })

  test("respects single and double quotes", () => {
    //#given
    const cmd = `echo "a && b"; echo 'c || d'`
    //#when
    const parts = splitCommands(cmd)
    //#then
    expect(parts).toEqual([`echo "a && b"`, `echo 'c || d'`])
  })

  test("drops empties and trims", () => {
    //#given
    const cmd = "  pytest  &&  "
    //#when
    const parts = splitCommands(cmd)
    //#then
    expect(parts).toEqual(["pytest"])
  })
})

describe("unwrapWrapper", () => {
  test("strips rtk prefix", () => {
    //#given
    const segment = "rtk git status"
    //#when
    const result = unwrapWrapper(segment)
    //#then
    expect(result).toBe("git status")
  })

  test("strips bash -c with quotes", () => {
    //#given
    const segment = `bash -c "rm -rf x"`
    //#when
    const result = unwrapWrapper(segment)
    //#then
    expect(result).toBe("rm -rf x")
  })

  test("strips repeatedly and case-insensitively", () => {
    //#given
    const segment = `RTK bash -c 'sh -c "ls"'`
    //#when
    const result = unwrapWrapper(segment)
    //#then
    expect(result).toBe("ls")
  })
})

describe("classifyBashCommand ALLOW verbs", () => {
  const allowCases: Array<[string, string]> = [
    ["pytest", "pytest tests/"],
    ["mypy", "mypy src/"],
    ["ruff", "ruff check src/"],
    ["tsc", "tsc --noEmit"],
    ["bun test", "bun test tests/foo.test.ts"],
    ["bun run typecheck", "bun run typecheck"],
    ["bun run build", "bun run build"],
    ["git status", "git status"],
    ["git diff", "git diff HEAD"],
    ["git log", "git log --oneline -5"],
    ["ls", "ls -la"],
    ["cat", "cat README.md"],
  ]
  for (const [name, cmd] of allowCases) {
    test(`allows ${name}`, () => {
      //#given
      const command = cmd
      //#when
      const result = classifyBashCommand(command)
      //#then
      expect(result).toBe("allow")
    })
  }
})

describe("classifyBashCommand DENY verbs", () => {
  const denyCases: Array<[string, string]> = [
    ["rm", "rm -rf x"],
    ["git checkout", "git checkout -- file"],
    ["git reset", "git reset --hard"],
    ["git clean", "git clean -fd"],
    ["mv", "mv a b"],
    ["cp", "cp a b"],
    ["sed -i", "sed -i 's/a/b/' file"],
    ["tee", "echo hi | tee file"],
    ["redirect", "echo hi > file"],
    ["chmod", "chmod +x script.sh"],
    ["chown", "chown user file"],
    ["python -c", "python -c 'print(1)'"],
    ["python3 -c", "python3 -c 'print(1)'"],
  ]
  for (const [name, cmd] of denyCases) {
    test(`denies ${name}`, () => {
      //#given
      const command = cmd
      //#when
      const result = classifyBashCommand(command)
      //#then
      expect(result).toBe("deny")
    })
  }
})

describe("classifyBashCommand chaining and wrappers", () => {
  test("chained deny wins over allow", () => {
    //#given
    const cmd = "pytest && git checkout -- file"
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).toBe("deny")
  })

  test("rtk wrapper still denies", () => {
    //#given
    const cmd = "rtk git checkout -- file"
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).toBe("deny")
  })

  test("bash -c wrapper still denies", () => {
    //#given
    const cmd = `bash -c "rm -rf x"`
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).toBe("deny")
  })

  test("deny is case-insensitive", () => {
    //#given
    const cmd = "RM -rf x"
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).toBe("deny")
  })

  test("allows mkdir -p inside .matrixx/", () => {
    //#given
    const cmd = "mkdir -p .matrixx/notepads/x"
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).toBe("allow")
  })

  test("denies mkdir -p outside .matrixx/", () => {
    //#given
    const cmd = "mkdir -p src/new"
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).toBe("deny")
  })

  test("git add returns neutral", () => {
    //#given
    const cmd = "git add file"
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).toBe("neutral")
  })

  test("git commit returns neutral", () => {
    //#given
    const cmd = "git commit -m 'msg'"
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).toBe("neutral")
  })

  test("unknown command returns neutral", () => {
    //#given
    const cmd = "echo hello"
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).toBe("neutral")
  })
})

describe("classifyBashCommand edge: case-insensitivity", () => {
  test("denies uppercase RM -rf", () => {
    //#given
    const cmd = "RM -rf /tmp/x"
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).toBe("deny")
  })

  test("denies mixed-case Git Checkout --", () => {
    //#given
    const cmd = "Git Checkout -- f"
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).toBe("deny")
  })
})

describe("classifyBashCommand edge: quotes and redirect", () => {
  test("redirect inside double quotes does not deny", () => {
    //#given
    const cmd = 'echo "a > b"'
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).not.toBe("deny")
  })

  test("redirect inside single quotes does not deny", () => {
    //#given
    const cmd = "echo 'a > b'"
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).not.toBe("deny")
  })

  test("denies tee write", () => {
    //#given
    const cmd = "tee out.txt"
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).toBe("deny")
  })

  test("denies sed -i in-place edit", () => {
    //#given
    const cmd = "sed -i s/a/b/ f"
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).toBe("deny")
  })

  test("denies chmod +x", () => {
    //#given
    const cmd = "chmod +x f"
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).toBe("deny")
  })
})

describe("classifyBashCommand edge: grey-zone and neutrals", () => {
  test("allows mkdir inside .matrixx/ notepads", () => {
    //#given
    const cmd = "mkdir -p .matrixx/notepads/t"
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).toBe("allow")
  })

  test("denies mkdir outside .matrixx/", () => {
    //#given
    const cmd = "mkdir -p src/hack"
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).toBe("deny")
  })

  test("denies python3 -c inline script", () => {
    //#given
    const cmd = 'python3 -c "print(1)"'
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).toBe("deny")
  })

  test("git commit stays neutral", () => {
    //#given
    const cmd = "git commit -m x"
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).toBe("neutral")
  })

  test("ls stays allow", () => {
    //#given
    const cmd = "ls -la"
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).toBe("allow")
  })

  test("cat stays allow", () => {
    //#given
    const cmd = "cat README.md"
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).toBe("allow")
  })
})

describe("classifyBashCommand edge: word-boundary guard", () => {
  test("npm does not false-fire mv/cp deny", () => {
    //#given
    const cmd = "npm run build"
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).not.toBe("deny")
  })

  test("improve does not false-fire mv deny", () => {
    //#given
    const cmd = "improve docs"
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).not.toBe("deny")
  })
})

describe("classifyBashCommand edge: multi-separator chaining", () => {
  test("semicolon-chained deny wins", () => {
    //#given
    const cmd = "pytest; rm -rf x"
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).toBe("deny")
  })

  test("double-pipe-chained deny wins", () => {
    //#given
    const cmd = "git status || git checkout -- f"
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).toBe("deny")
  })

  test("pipe into tee denies", () => {
    //#given
    const cmd = "echo hi | tee f"
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).toBe("deny")
  })

  test("newline-joined allows stay allow", () => {
    //#given
    const cmd = "pytest\nmypy"
    //#when
    const result = classifyBashCommand(cmd)
    //#then
    expect(result).toBe("allow")
  })
})
