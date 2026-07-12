import { describe, expect, test } from "bun:test";
import { isDeepSeekModel, isGptModel, isMimoModel, isQwenModel } from "../../src/agents/types";

describe("isGptModel", () => {
  test("standard openai provider models", () => {
    expect(isGptModel("openai/gpt-5.2")).toBe(true);
    expect(isGptModel("openai/gpt-4o")).toBe(true);
    expect(isGptModel("openai/o1")).toBe(true);
    expect(isGptModel("openai/o3-mini")).toBe(true);
  });

  test("github copilot gpt models", () => {
    expect(isGptModel("github-copilot/gpt-5.2")).toBe(true);
    expect(isGptModel("github-copilot/gpt-4o")).toBe(true);
  });

  test("litellm proxied gpt models", () => {
    expect(isGptModel("litellm/gpt-5.2")).toBe(true);
    expect(isGptModel("litellm/gpt-4o")).toBe(true);
    expect(isGptModel("litellm/o1")).toBe(true);
    expect(isGptModel("litellm/o3-mini")).toBe(true);
    expect(isGptModel("litellm/o4-mini")).toBe(true);
  });

  test("other proxied gpt models", () => {
    expect(isGptModel("ollama/gpt-4o")).toBe(true);
    expect(isGptModel("custom-provider/gpt-5.2")).toBe(true);
  });

  test("gpt4 prefix without hyphen (legacy naming)", () => {
    expect(isGptModel("litellm/gpt4o")).toBe(true);
    expect(isGptModel("ollama/gpt4")).toBe(true);
  });

  test("claude models are not gpt", () => {
    expect(isGptModel("anthropic/claude-opus-4-6")).toBe(false);
    expect(isGptModel("anthropic/claude-sonnet-4-5")).toBe(false);
    expect(isGptModel("litellm/anthropic.claude-opus-4-5")).toBe(false);
  });

  test("gemini models are not gpt", () => {
    expect(isGptModel("google/gemini-3-pro")).toBe(false);
    expect(isGptModel("litellm/gemini-3-pro")).toBe(false);
  });

  test("opencode provider is not gpt", () => {
    expect(isGptModel("opencode/claude-opus-4-6")).toBe(false);
  });
});

describe("isDeepSeekModel", () => {
  test("standard opencode-go deepseek models", () => {
    expect(isDeepSeekModel("opencode-go/deepseek-v4-flash")).toBe(true);
    expect(isDeepSeekModel("opencode-go/deepseek-v4")).toBe(true);
    expect(isDeepSeekModel("opencode-go/deepseek-v3")).toBe(true);
  });

  test("openai provider deepseek models", () => {
    expect(isDeepSeekModel("openai/deepseek-v4-flash")).toBe(true);
  });

  test("litellm proxied deepseek models", () => {
    expect(isDeepSeekModel("litellm/deepseek-v4-flash")).toBe(true);
  });

  test("claude models are not deepseek", () => {
    expect(isDeepSeekModel("anthropic/claude-opus-4-6")).toBe(false);
  });

  test("gpt models are not deepseek", () => {
    expect(isDeepSeekModel("openai/gpt-5.2")).toBe(false);
  });

  test("qwen models are not deepseek", () => {
    expect(isDeepSeekModel("opencode-go/qwen3.7-plus")).toBe(false);
  });

  test("mimo models are not deepseek", () => {
    expect(isDeepSeekModel("opencode-go/mimo-v2.5")).toBe(false);
  });
});

describe("isMimoModel", () => {
  test("standard opencode-go mimo models", () => {
    expect(isMimoModel("opencode-go/mimo-v2.5")).toBe(true);
    expect(isMimoModel("opencode-go/mimo-v2")).toBe(true);
  });

  test("other provider mimo models", () => {
    expect(isMimoModel("litellm/mimo-v2.5")).toBe(true);
  });

  test("claude models are not mimo", () => {
    expect(isMimoModel("anthropic/claude-opus-4-6")).toBe(false);
  });

  test("deepseek models are not mimo", () => {
    expect(isMimoModel("opencode-go/deepseek-v4-flash")).toBe(false);
  });

  test("qwen models are not mimo", () => {
    expect(isMimoModel("opencode-go/qwen3.7-plus")).toBe(false);
  });
});

describe("isQwenModel", () => {
  test("standard opencode-go qwen models", () => {
    expect(isQwenModel("opencode-go/qwen3.7-plus")).toBe(true);
    expect(isQwenModel("opencode-go/qwen3.5")).toBe(true);
    expect(isQwenModel("opencode-go/qwen-max")).toBe(true);
  });

  test("openai provider qwen models", () => {
    expect(isQwenModel("openai/qwen3.7-plus")).toBe(true);
  });

  test("litellm proxied qwen models", () => {
    expect(isQwenModel("litellm/qwen3.7-plus")).toBe(true);
  });

  test("claude models are not qwen", () => {
    expect(isQwenModel("anthropic/claude-opus-4-6")).toBe(false);
  });

  test("deepseek models are not qwen", () => {
    expect(isQwenModel("opencode-go/deepseek-v4-flash")).toBe(false);
  });

  test("mimo models are not qwen", () => {
    expect(isQwenModel("opencode-go/mimo-v2.5")).toBe(false);
  });

  test("gpt models are not qwen", () => {
    expect(isQwenModel("openai/gpt-5.2")).toBe(false);
  });
});
