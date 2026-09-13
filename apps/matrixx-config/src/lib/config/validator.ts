import schemaJson from "./schema.json";

export interface ValidationError {
  path: string;
  message: string;
  value?: unknown;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

const VALID_TIERS = [
  "free",
  "fast",
  "standard",
  "premium",
  "frontier",
] as const;
const VALID_MODES = ["subagent", "primary", "all"] as const;
const VALID_PERMISSIONS = ["ask", "allow", "deny"] as const;
const VALID_REASONING = ["low", "medium", "high", "xhigh"] as const;
const VALID_VERBOSITY = ["low", "medium", "high"] as const;

const AGENT_NAMES = new Set([
  "build",
  "plan",
  "morpheus",
  "keymaker",
  "mouse",
  "OpenCode-Builder",
  "oracle",
  "seraph",
  "smith",
  "merovingian",
  "operator",
  "trinity",
  "construct",
  "architect",
  "cipher",
  "sentinel",
  "sati",
]);

const OBJECT_PROPS = new Set([
  "experimental",
  "dcp",
  "morpheus_agent",
  "tdd_enforcer",
  "matrix_loop",
  "tmux",
  "background_task",
  "security",
  "runtime_fallback",
  "context_mode",
  "categories",
  "skills",
  "evolution",
  "assembly",
  "notification",
  "babysitting",
]);

function e(
  errors: ValidationError[],
  path: string,
  message: string,
  value?: unknown,
): void {
  errors.push({ path, message, value });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function inSet<T>(s: ReadonlySet<T> | readonly T[], v: unknown): v is T {
  return s instanceof Set
    ? s.has(v as T)
    : (s as readonly T[]).includes(v as T);
}

function validateAgent(
  path: string,
  cfg: unknown,
  errs: ValidationError[],
): void {
  if (!isRecord(cfg)) {
    e(errs, path, "Must be an object", cfg);
    return;
  }
  const a = cfg as Record<string, unknown>;

  if (a.tier !== undefined && !inSet(VALID_TIERS, a.tier))
    e(
      errs,
      `${path}.tier`,
      `Must be one of: ${VALID_TIERS.join(", ")}`,
      a.tier,
    );
  if (a.mode !== undefined && !inSet(VALID_MODES, a.mode))
    e(
      errs,
      `${path}.mode`,
      `Must be one of: ${VALID_MODES.join(", ")}`,
      a.mode,
    );
  if (
    a.color !== undefined &&
    !(typeof a.color === "string" && /^#[0-9A-Fa-f]{6}$/.test(a.color))
  )
    e(errs, `${path}.color`, "Must be hex (#RRGGBB)", a.color);
  if (
    a.reasoningEffort !== undefined &&
    !inSet(VALID_REASONING, a.reasoningEffort)
  )
    e(
      errs,
      `${path}.reasoningEffort`,
      `Must be one of: ${VALID_REASONING.join(", ")}`,
      a.reasoningEffort,
    );
  if (a.textVerbosity !== undefined && !inSet(VALID_VERBOSITY, a.textVerbosity))
    e(
      errs,
      `${path}.textVerbosity`,
      `Must be one of: ${VALID_VERBOSITY.join(", ")}`,
      a.textVerbosity,
    );

  if (
    a.temperature !== undefined &&
    (typeof a.temperature !== "number" ||
      a.temperature < 0 ||
      a.temperature > 2)
  )
    e(errs, `${path}.temperature`, "Must be 0–2", a.temperature);
  if (
    a.top_p !== undefined &&
    (typeof a.top_p !== "number" || a.top_p < 0 || a.top_p > 1)
  )
    e(errs, `${path}.top_p`, "Must be 0–1", a.top_p);

  if (a.permission !== undefined) {
    if (!isRecord(a.permission)) {
      e(errs, `${path}.permission`, "Must be an object", a.permission);
    } else {
      for (const pk of [
        "edit",
        "webfetch",
        "task",
        "doom_loop",
        "external_directory",
      ] as const) {
        const pv = (a.permission as Record<string, unknown>)[pk];
        if (pv !== undefined && !inSet(VALID_PERMISSIONS, pv))
          e(errs, `${path}.permission.${pk}`, "Must be ask/allow/deny", pv);
      }
      const bashPerm = (a.permission as Record<string, unknown>).bash;
      if (bashPerm !== undefined) {
        if (typeof bashPerm === "string" && !inSet(VALID_PERMISSIONS, bashPerm))
          e(
            errs,
            `${path}.permission.bash`,
            "Must be ask/allow/deny",
            bashPerm,
          );
        else if (isRecord(bashPerm)) {
          for (const [cmd, cp] of Object.entries(bashPerm)) {
            if (!inSet(VALID_PERMISSIONS, cp))
              e(
                errs,
                `${path}.permission.bash.${cmd}`,
                "Must be ask/allow/deny",
                cp,
              );
          }
        } else
          e(
            errs,
            `${path}.permission.bash`,
            "Must be a string or object",
            bashPerm,
          );
      }
    }
  }

  if (a.thinking !== undefined) {
    if (!isRecord(a.thinking)) {
      e(errs, `${path}.thinking`, "Must be an object", a.thinking);
    } else {
      const tt = (a.thinking as Record<string, unknown>).type;
      if (tt === undefined)
        e(errs, `${path}.thinking.type`, "Required (enabled/disabled)");
      else if (tt !== "enabled" && tt !== "disabled")
        e(errs, `${path}.thinking.type`, "Must be 'enabled' or 'disabled'", tt);
    }
  }

  if (a.fallbackChain !== undefined) {
    if (!Array.isArray(a.fallbackChain)) {
      e(errs, `${path}.fallbackChain`, "Must be an array", a.fallbackChain);
    } else {
      a.fallbackChain.forEach((entry: unknown, i: number) => {
        if (!isRecord(entry)) {
          e(errs, `${path}.fallbackChain[${i}]`, "Must be an object", entry);
          return;
        }
        const fe = entry as Record<string, unknown>;
        if (fe.providers !== undefined && !Array.isArray(fe.providers))
          e(
            errs,
            `${path}.fallbackChain[${i}].providers`,
            "Must be array of strings",
            fe.providers,
          );
        if (fe.model !== undefined && typeof fe.model !== "string")
          e(
            errs,
            `${path}.fallbackChain[${i}].model`,
            "Must be a string",
            fe.model,
          );
      });
    }
  }
}

export function validateConfig(data: unknown): ValidationResult {
  const errs: ValidationError[] = [];

  if (!isRecord(data)) {
    e(errs, "", "Config must be a non-null object", data);
    return { ok: false, errors: errs };
  }

  const config = data as Record<string, unknown>;

  if (
    config.default_tier !== undefined &&
    !inSet(VALID_TIERS, config.default_tier)
  ) {
    e(
      errs,
      "default_tier",
      `Must be one of: ${VALID_TIERS.join(", ")}`,
      config.default_tier,
    );
  }

  if (config.agents !== undefined) {
    if (!isRecord(config.agents)) {
      e(errs, "agents", "Must be an object");
    } else {
      for (const [name, agentCfg] of Object.entries(
        config.agents as Record<string, unknown>,
      )) {
        if (!AGENT_NAMES.has(name)) {
          e(
            errs,
            `agents.${name}`,
            `Unknown agent. Valid: ${[...AGENT_NAMES].join(", ")}`,
            name,
          );
          continue;
        }
        validateAgent(`agents.${name}`, agentCfg, errs);
      }
    }
  }

  if (config.tiers !== undefined) {
    if (!isRecord(config.tiers)) {
      e(errs, "tiers", "Must be an object");
    } else {
      for (const [tn, tc] of Object.entries(
        config.tiers as Record<string, unknown>,
      )) {
        if (!isRecord(tc)) {
          e(errs, `tiers.${tn}`, "Must be an object", tc);
          continue;
        }
        const t = tc as Record<string, unknown>;
        if (t.model !== undefined && typeof t.model !== "string")
          e(errs, `tiers.${tn}.model`, "Must be a string", t.model);
      }
    }
  }

  if (config.disabled_agents !== undefined) {
    if (!Array.isArray(config.disabled_agents)) {
      e(errs, "disabled_agents", "Must be an array", config.disabled_agents);
    } else {
      (config.disabled_agents as unknown[]).forEach((v, i) => {
        if (!AGENT_NAMES.has(v as string))
          e(
            errs,
            `disabled_agents[${i}]`,
            `Unknown agent. Valid: ${[...AGENT_NAMES].join(", ")}`,
            v,
          );
      });
    }
  }

  for (const prop of OBJECT_PROPS) {
    if (config[prop] !== undefined && !isRecord(config[prop])) {
      e(errs, prop, "Must be an object if specified", config[prop]);
    }
  }

  return { ok: errs.length === 0, errors: errs };
}
