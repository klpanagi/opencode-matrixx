import { basename } from "node:path";
import * as p from "@clack/prompts";
import type { DepStatus, SetupState } from "./types";

export async function runSetupPrompts(deps: DepStatus[], opts: { yes: boolean }): Promise<SetupState> {
  if (opts.yes) {
    return {
      taskSystem: true,
      headroom: { enabled: false },
      rtk: { enabled: false },
      dcp: { enabled: false },
      contextMode: false,
    };
  }

  p.intro("Matrixx Setup");

  const missing = deps.filter((d) => !d.required && !d.found);
  for (const dep of missing) {
    const ans = await p.confirm({
      message: `Install ${dep.name}? (${dep.installHint.split("\n")[0]?.slice(0, 60) ?? ""})`,
      initialValue: false,
    });
    if (p.isCancel(ans)) {
      p.cancel("Cancelled");
      process.exit(130);
    }
    if (ans) {
      p.note(dep.installHint, `Run manually: ${dep.name}`);
    }
  }

  const taskSystemAns = await p.confirm({
    message: "Enable new task system (experimental.task_system)?",
    initialValue: true,
  });
  if (p.isCancel(taskSystemAns)) {
    p.cancel("Cancelled");
    process.exit(130);
  }

  const headroomEnabled = await p.confirm({
    message: "Enable Headroom proxy compression?",
    initialValue: false,
  });
  if (p.isCancel(headroomEnabled)) {
    p.cancel("Cancelled");
    process.exit(130);
  }
  let headroomProxyUrl: string | undefined;
  let headroomProject: string | undefined;
  if (headroomEnabled) {
    const proxyAns = await p.text({
      message: "Headroom proxyUrl?",
      initialValue: "http://127.0.0.1:8787",
      validate: (v) => {
        if (!v) return undefined;
        try {
          new URL(v);
          return undefined;
        } catch {
          return "Invalid URL";
        }
      },
    });
    if (p.isCancel(proxyAns)) {
      p.cancel("Cancelled");
      process.exit(130);
    }
    headroomProxyUrl = proxyAns as string;
    const projAns = await p.text({
      message: "Headroom project?",
      initialValue: basename(process.cwd()),
    });
    if (p.isCancel(projAns)) {
      p.cancel("Cancelled");
      process.exit(130);
    }
    headroomProject = projAns as string;
  }

  const rtkEnabled = await p.confirm({
    message: "Enable RTK bash rewriter?",
    initialValue: false,
  });
  if (p.isCancel(rtkEnabled)) {
    p.cancel("Cancelled");
    process.exit(130);
  }
  let rtkBinaryPath: string | undefined;
  if (rtkEnabled) {
    const binAns = await p.text({
      message: "RTK binary path?",
      initialValue: "rtk",
    });
    if (p.isCancel(binAns)) {
      p.cancel("Cancelled");
      process.exit(130);
    }
    rtkBinaryPath = binAns as string;
  }

  const dcpEnabled = await p.confirm({
    message: "Enable DCP pruning tiers?",
    initialValue: false,
  });
  if (p.isCancel(dcpEnabled)) {
    p.cancel("Cancelled");
    process.exit(130);
  }

  const contextModeEnabled = await p.confirm({
    message: "Enable context-mode plugin?",
    initialValue: false,
  });
  if (p.isCancel(contextModeEnabled)) {
    p.cancel("Cancelled");
    process.exit(130);
  }

  p.outro("Setup choices collected");

  return {
    taskSystem: taskSystemAns as boolean,
    headroom: {
      enabled: headroomEnabled as boolean,
      proxyUrl: headroomProxyUrl,
      project: headroomProject,
    },
    rtk: {
      enabled: rtkEnabled as boolean,
      binaryPath: rtkBinaryPath,
    },
    dcp: { enabled: dcpEnabled as boolean },
    contextMode: contextModeEnabled as boolean,
  };
}
