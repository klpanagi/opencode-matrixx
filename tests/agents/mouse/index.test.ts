import { describe, expect, test } from "bun:test"
import {
  buildMousePrompt,
  createMouseAgentWithOverrides,
  getMousePromptSource,
  MOUSE_DEFAULTS,
} from "../../../src/agents/mouse/index"
import {
  buildConstraintsSection,
  buildTodoDisciplineSection,
  buildVerificationTable,
} from "../../../src/agents/mouse/shared"
import {
  buildMousePrompt,
  createMouseAgentWithOverrides,
  getMousePromptSource,
  MOUSE_DEFAULTS,
} from "../../../src/agents/mouse/index"

describe("createMouseAgentWithOverrides", () => {
  describe("honored fields", () => {
    test("applies model override", () => {
      // given
      const override = { model: "openai/gpt-5.2" }

      // when
      const result = createMouseAgentWithOverrides(override)

      // then
      expect(result.model).toBe("openai/gpt-5.2")
    })

    test("applies temperature override", () => {
      // given
      const override = { temperature: 0.5 }

      // when
      const result = createMouseAgentWithOverrides(override)

      // then
      expect(result.temperature).toBe(0.5)
    })

    test("applies top_p override", () => {
      // given
      const override = { top_p: 0.9 }

      // when
      const result = createMouseAgentWithOverrides(override)

      // then
      expect(result.top_p).toBe(0.9)
    })

    test("applies description override", () => {
      // given
      const override = { description: "Custom description" }

      // when
      const result = createMouseAgentWithOverrides(override)

      // then
      expect(result.description).toBe("Custom description")
    })

    test("applies color override", () => {
      // given
      const override = { color: "#FF0000" }

      // when
      const result = createMouseAgentWithOverrides(override)

      // then
      expect(result.color).toBe("#FF0000")
    })

    test("appends prompt_append to base prompt", () => {
      // given
      const override = { prompt_append: "Extra instructions here" }

      // when
      const result = createMouseAgentWithOverrides(override)

      // then
      expect(result.prompt).toContain("You work ALONE")
      expect(result.prompt).toContain("Extra instructions here")
    })
  })

  describe("defaults", () => {
    test("uses default model when no override", () => {
      // given
      const override = {}

      // when
      const result = createMouseAgentWithOverrides(override)

      // then
      expect(result.model).toBe(MOUSE_DEFAULTS.model)
    })

    test("uses default temperature when no override", () => {
      // given
      const override = {}

      // when
      const result = createMouseAgentWithOverrides(override)

      // then
      expect(result.temperature).toBe(MOUSE_DEFAULTS.temperature)
    })
  })

  describe("disable semantics", () => {
    test("disable: true causes override block to be ignored", () => {
      // given
      const override = {
        disable: true,
        model: "openai/gpt-5.2",
        temperature: 0.9,
      }

      // when
      const result = createMouseAgentWithOverrides(override)

      // then - defaults should be used, not the overrides
      expect(result.model).toBe(MOUSE_DEFAULTS.model)
      expect(result.temperature).toBe(MOUSE_DEFAULTS.temperature)
    })
  })

  describe("constrained fields", () => {
    test("mode is forced to subagent", () => {
      // given
      const override = { mode: "primary" as const }

      // when
      const result = createMouseAgentWithOverrides(override)

      // then
      expect(result.mode).toBe("subagent")
    })

    test("prompt override is ignored (discipline text preserved)", () => {
      // given
      const override = { prompt: "Completely new prompt that replaces everything" }

      // when
      const result = createMouseAgentWithOverrides(override)

      // then
      expect(result.prompt).toContain("You work ALONE")
      expect(result.prompt).not.toBe("Completely new prompt that replaces everything")
    })
  })

  describe("tool safety (task blocked, delegate_agent allowed)", () => {
    test("task remains blocked, delegate_agent is allowed via tools format", () => {
      // given
      const override = {
        tools: {
          task: true,
          delegate_agent: true,
          read: true,
        },
      }

      // when
      const result = createMouseAgentWithOverrides(override)

      // then
      const tools = result.tools as Record<string, boolean> | undefined
      const permission = result.permission as Record<string, string> | undefined
      if (tools) {
        expect(tools.task).toBe(false)
        // delegate_agent is NOW ALLOWED for subagents to spawn explore/librarian
        expect(tools.delegate_agent).toBe(true)
        expect(tools.read).toBe(true)
      }
      if (permission) {
        expect(permission.task).toBe("deny")
        // delegate_agent is NOW ALLOWED for subagents to spawn explore/librarian
        expect(permission.delegate_agent).toBe("allow")
      }
    })

    test("task remains blocked when using permission format override", () => {
      // given
      const override = {
        permission: {
          task: "allow",
          delegate_agent: "allow",
          read: "allow",
        },
      } as { permission: Record<string, string> }

      // when
      const result = createMouseAgentWithOverrides(override as Parameters<typeof createMouseAgentWithOverrides>[0])

      // then - task blocked, but delegate_agent allowed for explore/librarian spawning
      const tools = result.tools as Record<string, boolean> | undefined
      const permission = result.permission as Record<string, string> | undefined
      if (tools) {
        expect(tools.task).toBe(false)
        expect(tools.delegate_agent).toBe(true)
      }
      if (permission) {
        expect(permission.task).toBe("deny")
        expect(permission.delegate_agent).toBe("allow")
      }
    })
  })

  describe("useTaskSystem integration", () => {
    test("useTaskSystem=true produces Task_Discipline prompt for Claude", () => {
      //#given
      const override = { model: "anthropic/claude-sonnet-4-5" }

      //#when
      const result = createMouseAgentWithOverrides(override, undefined, true)

      //#then
      expect(result.prompt).toContain("TaskCreate")
      expect(result.prompt).toContain("TaskUpdate")
      expect(result.prompt).not.toContain("todowrite")
    })

    test("useTaskSystem=true produces task_discipline_spec prompt for GPT", () => {
      //#given
      const override = { model: "openai/gpt-5.2" }

      //#when
      const result = createMouseAgentWithOverrides(override, undefined, true)

      //#then
      expect(result.prompt).toContain("<task_discipline_spec>")
      expect(result.prompt).toContain("TaskCreate")
      expect(result.prompt).not.toContain("<todo_discipline_spec>")
    })

    test("useTaskSystem=false (default) produces Todo_Discipline prompt", () => {
      //#given
      const override = {}

      //#when
      const result = createMouseAgentWithOverrides(override)

      //#then
      expect(result.prompt).toContain("todowrite")
      expect(result.prompt).not.toContain("TaskCreate")
    })

    test("useTaskSystem=true explicitly lists task management tools as ALLOWED for Claude", () => {
      //#given
      const override = { model: "anthropic/claude-sonnet-4-5" }

      //#when
      const result = createMouseAgentWithOverrides(override, undefined, true)

      //#then - prompt must disambiguate: delegation tool blocked, management tools allowed
      expect(result.prompt).toContain("task_create")
      expect(result.prompt).toContain("task_update")
      expect(result.prompt).toContain("task_list")
      expect(result.prompt).toContain("task_get")
      expect(result.prompt).toContain("agent delegation tool")
    })

    test("useTaskSystem=true explicitly lists task management tools as ALLOWED for GPT", () => {
      //#given
      const override = { model: "openai/gpt-5.2" }

      //#when
      const result = createMouseAgentWithOverrides(override, undefined, true)

      //#then - prompt must disambiguate: delegation tool blocked, management tools allowed
      expect(result.prompt).toContain("task_create")
      expect(result.prompt).toContain("task_update")
      expect(result.prompt).toContain("task_list")
      expect(result.prompt).toContain("task_get")
      expect(result.prompt).toContain("Agent delegation tool")
    })

    test("useTaskSystem=false does NOT list task management tools in constraints", () => {
      //#given - Claude model without task system
      const override = { model: "anthropic/claude-sonnet-4-5" }

      //#when
      const result = createMouseAgentWithOverrides(override, undefined, false)

      //#then - no task management tool references in constraints section
      expect(result.prompt).not.toContain("task_create")
      expect(result.prompt).not.toContain("task_update")
    })
  })

  describe("prompt composition", () => {
    test("base prompt contains discipline constraints", () => {
      // given
      const override = {}

      // when
      const result = createMouseAgentWithOverrides(override)

      // then
      expect(result.prompt).toContain("Mouse")
      expect(result.prompt).toContain("You work ALONE")
    })

    test("Claude model uses default prompt with BLOCKED ACTIONS section", () => {
      // given
      const override = { model: "anthropic/claude-sonnet-4-5" }

      // when
      const result = createMouseAgentWithOverrides(override)

      // then
      expect(result.prompt).toContain("BLOCKED ACTIONS")
      expect(result.prompt).not.toContain("<blocked_actions>")
    })

    test("GPT model uses GPT-optimized prompt with blocked_actions section", () => {
      // given
      const override = { model: "openai/gpt-5.2" }

      // when
      const result = createMouseAgentWithOverrides(override)

      // then
      expect(result.prompt).toContain("<blocked_actions>")
      expect(result.prompt).toContain("<output_verbosity_spec>")
      expect(result.prompt).toContain("<scope_and_design_constraints>")
    })

    test("prompt_append is added after base prompt", () => {
      // given
      const override = { prompt_append: "CUSTOM_MARKER_FOR_TEST" }

      // when
      const result = createMouseAgentWithOverrides(override)

      // then
      const baseEndIndex = result.prompt?.indexOf("Dense > verbose.")
      const appendIndex = result.prompt?.indexOf("CUSTOM_MARKER_FOR_TEST")
      expect(baseEndIndex).not.toBe(-1)
      expect(appendIndex).toBeGreaterThan(baseEndIndex)
    })
  })

  type AgentConfigWithModelConfig = {
    thinking?: { type: "enabled" | "disabled"; budgetTokens?: number }
    reasoningEffort?: "low" | "medium" | "high" | "xhigh"
  }

  describe("model-specific thinking/reasoning config", () => {
    test("Claude model gets thinking config", () => {
      //#given
      const override = { model: "anthropic/claude-sonnet-4-5" }

      //#when
      const result = createMouseAgentWithOverrides(override)

      //#then
      expect((result as AgentConfigWithModelConfig).thinking).toEqual({ type: "enabled", budgetTokens: 32000 })
      expect((result as AgentConfigWithModelConfig).reasoningEffort).toBeUndefined()
    })

    test("Google Vertex Anthropic model gets thinking config", () => {
      //#given
      const override = { model: "google-vertex-anthropic/claude-opus-4-6@default" }

      //#when
      const result = createMouseAgentWithOverrides(override)

      //#then
      expect((result as AgentConfigWithModelConfig).thinking).toEqual({ type: "enabled", budgetTokens: 32000 })
    })

    test("GPT model gets reasoningEffort config", () => {
      //#given
      const override = { model: "openai/gpt-5.2" }

      //#when
      const result = createMouseAgentWithOverrides(override)

      //#then
      expect((result as AgentConfigWithModelConfig).reasoningEffort).toBe("medium")
      expect((result as AgentConfigWithModelConfig).thinking).toBeUndefined()
    })

    test("Gemini model gets NO thinking or reasoning config", () => {
      //#given
      const override = { model: "google-vertex/gemini-flash-latest" }

      //#when
      const result = createMouseAgentWithOverrides(override)

      //#then
      expect((result as AgentConfigWithModelConfig).thinking).toBeUndefined()
      expect((result as AgentConfigWithModelConfig).reasoningEffort).toBeUndefined()
    })

    test("Google Gemini Pro model gets NO thinking config", () => {
      //#given
      const override = { model: "google/gemini-3-pro" }

      //#when
      const result = createMouseAgentWithOverrides(override)

      //#then
      expect((result as AgentConfigWithModelConfig).thinking).toBeUndefined()
      expect((result as AgentConfigWithModelConfig).reasoningEffort).toBeUndefined()
    })

    test("unknown provider model gets NO thinking config", () => {
      //#given
      const override = { model: "custom-provider/custom-model" }

      //#when
      const result = createMouseAgentWithOverrides(override)

      //#then
      expect((result as AgentConfigWithModelConfig).thinking).toBeUndefined()
      expect((result as AgentConfigWithModelConfig).reasoningEffort).toBeUndefined()
    })
  })
})

describe("getMousePromptSource", () => {
  test("returns 'gpt' for OpenAI models", () => {
    // given
    const model = "openai/gpt-5.2"

    // when
    const source = getMousePromptSource(model)

    // then
    expect(source).toBe("gpt")
  })

  test("returns 'gpt' for GitHub Copilot GPT models", () => {
    // given
    const model = "github-copilot/gpt-4o"

    // when
    const source = getMousePromptSource(model)

    // then
    expect(source).toBe("gpt")
  })

  test("returns 'default' for Claude models", () => {
    // given
    const model = "anthropic/claude-sonnet-4-5"

    // when
    const source = getMousePromptSource(model)

    // then
    expect(source).toBe("default")
  })

  test("returns 'default' for undefined model", () => {
    // given
    const model = undefined

    // when
    const source = getMousePromptSource(model)

    // then
    expect(source).toBe("default")
  })
})

describe("buildMousePrompt", () => {
  test("GPT model prompt contains GPT-5.2 specific sections", () => {
    // given
    const model = "openai/gpt-5.2"

    // when
    const prompt = buildMousePrompt(model, false)

    // then
    expect(prompt).toContain("<identity>")
    expect(prompt).toContain("<output_verbosity_spec>")
    expect(prompt).toContain("<scope_and_design_constraints>")
    expect(prompt).toContain("<tool_usage_rules>")
  })

  test("Claude model prompt contains Claude-specific sections", () => {
    // given
    const model = "anthropic/claude-sonnet-4-5"

    // when
    const prompt = buildMousePrompt(model, false)

    // then
    expect(prompt).toContain("<Role>")
    expect(prompt).toContain("<Critical_Constraints>")
    expect(prompt).toContain("BLOCKED ACTIONS")
  })

  test("useTaskSystem=true includes Task_Discipline for GPT", () => {
    // given
    const model = "openai/gpt-5.2"

    // when
    const prompt = buildMousePrompt(model, true)

    // then
    expect(prompt).toContain("<task_discipline_spec>")
    expect(prompt).toContain("TaskCreate")
  })

  test("useTaskSystem=false includes Todo_Discipline for Claude", () => {
    // given
    const model = "anthropic/claude-sonnet-4-5"

    // when
    const prompt = buildMousePrompt(model, false)

    // then
    expect(prompt).toContain("<Todo_Discipline>")
    expect(prompt).toContain("todowrite")
  })
})

describe("getMousePromptSource (new variants)", () => {
  test("returns 'deepseek' for DeepSeek models", () => {
    expect(getMousePromptSource("opencode-go/deepseek-v4-flash")).toBe("deepseek");
  });

  test("returns 'mimo' for Mimo models", () => {
    expect(getMousePromptSource("opencode-go/mimo-v2.5")).toBe("mimo");
  });

  test("returns 'qwen' for Qwen models", () => {
    expect(getMousePromptSource("opencode-go/qwen3.7-plus")).toBe("qwen");
  });

  test("GPT takes priority over DeepSeek when model matches GPT prefixes", () => {
    expect(getMousePromptSource("opencode-go/gpt-5.2")).toBe("gpt");
  });
});

describe("buildMousePrompt (new variants)", () => {
  test("DeepSeek model prompt contains DeepSeek-specific sections", () => {
    //#given
    const model = "opencode-go/deepseek-v4-flash";

    //#when
    const prompt = buildMousePrompt(model, false);

    //#then
    expect(prompt).toContain("<Role>");
    expect(prompt).toContain("<Critical_Constraints>");
    expect(prompt).toContain("<Verification>");
    expect(prompt).toContain("<Style>");
    expect(prompt).not.toContain("you're too helpful");
  });

  test("Mimo model prompt contains Mimo-specific sections", () => {
    //#given
    const model = "opencode-go/mimo-v2.5";

    //#when
    const prompt = buildMousePrompt(model, false);

    //#then
    expect(prompt).toContain("<role>");
    expect(prompt).toContain("<rules>");
    expect(prompt).toContain("<verify>");
    expect(prompt).toContain("<discipline>");
    // Mimo uses lowercase tags (model-specific)
    expect(prompt).not.toContain("<Role>");
  });

  test("Qwen model prompt contains Qwen-specific sections", () => {
    //#given
    const model = "opencode-go/qwen3.7-plus";

    //#when
    const prompt = buildMousePrompt(model, false);

    //#then
    expect(prompt).toContain("<identity>");
    expect(prompt).toContain("<blocked_actions>");
    expect(prompt).toContain("<scope_control>");
    expect(prompt).toContain("<todo_discipline>");
    expect(prompt).toContain("<verification>");
    expect(prompt).toContain("<style>");
  });

  test("DeepSeek prompt with useTaskSystem=true uses Task_Discipline", () => {
    //#given
    const model = "opencode-go/deepseek-v4-flash";

    //#when
    const prompt = buildMousePrompt(model, true);

    //#then
    expect(prompt).toContain("<Task_Discipline>");
    expect(prompt).toContain("<Critical_Constraints>");
    expect(prompt).toContain("<Verification>");
    expect(prompt).toContain("TaskCreate");
  });

  test("Mimo prompt with useTaskSystem=true uses Task reference", () => {
    //#given
    const model = "opencode-go/mimo-v2.5";

    //#when
    const prompt = buildMousePrompt(model, true);

    //#then
    expect(prompt).toContain("TaskCreate");
    expect(prompt).toContain("TaskUpdate");
  });

  test("Mimo prompt with useTaskSystem=false uses todowrite reference", () => {
    //#given
    const model = "opencode-go/mimo-v2.5";

    //#when
    const prompt = buildMousePrompt(model, false);

    //#then
    expect(prompt).toContain("todowrite");
    expect(prompt).not.toContain("TaskCreate");
  });

  test("Qwen prompt with useTaskSystem=true uses task_discipline", () => {
    //#given
    const model = "opencode-go/qwen3.7-plus";

    //#when
    const prompt = buildMousePrompt(model, true);

    //#then
    expect(prompt).toContain("<task_discipline>");
    expect(prompt).toContain("TaskCreate");
    expect(prompt).toContain("task_create");
  });

  test("Qwen prompt with useTaskSystem=false uses todo_discipline", () => {
    //#given
    const model = "opencode-go/qwen3.7-plus";

    //#when
    const prompt = buildMousePrompt(model, false);

    //#then
    expect(prompt).toContain("<todo_discipline>");
    expect(prompt).toContain("todowrite");
    expect(prompt).not.toContain("TaskCreate");
  });
});

describe("createMouseAgentWithOverrides (DeepSeek thinking)", () => {
  test("DeepSeek model gets thinking config (like Anthropic)", () => {
    //#given
    const override = { model: "opencode-go/deepseek-v4-flash" };

    //#when
    const result = createMouseAgentWithOverrides(override);

    //#then
    expect((result as AgentConfigWithModelConfig).thinking).toEqual({ type: "enabled", budgetTokens: 32000 });
  });
});

describe("shared prompt utilities", () => {
  test("buildConstraintsSection blocks task and allows delegate_agent", () => {
    const constraints = buildConstraintsSection(false);
    expect(constraints).toContain("BLOCKED");
    expect(constraints).toContain("delegate_agent");
    expect(constraints).toContain("You work ALONE");
  });

  test("buildConstraintsSection with useTaskSystem includes task management tools", () => {
    const constraints = buildConstraintsSection(true);
    expect(constraints).toContain("task_create");
    expect(constraints).toContain("task_update");
  });

  test("buildTodoDisciplineSection with useTaskSystem uses Task_Discipline", () => {
    const section = buildTodoDisciplineSection(true);
    expect(section).toContain("<Task_Discipline>");
    expect(section).toContain("TaskCreate");
    expect(section).not.toContain("todowrite");
  });

  test("buildTodoDisciplineSection without useTaskSystem uses Todo_Discipline", () => {
    const section = buildTodoDisciplineSection(false);
    expect(section).toContain("<Todo_Discipline>");
    expect(section).toContain("todowrite");
  });

  test("buildVerificationTable returns table with lsp_diagnostics check", () => {
    const table = buildVerificationTable(false);
    expect(table).toContain("lsp_diagnostics");
    expect(table).toContain("Zero errors");
    expect(table).toContain("No evidence = not complete.");
  });

  test("buildVerificationTable with useTaskSystem references TaskUpdate", () => {
    const table = buildVerificationTable(true);
    expect(table).toContain("TaskUpdate");
    expect(table).toContain("All tasks marked completed");
  });

  test("buildVerificationTable without useTaskSystem references todowrite", () => {
    const table = buildVerificationTable(false);
    expect(table).toContain("todowrite");
    expect(table).toContain("All todos marked completed");
  });
});
