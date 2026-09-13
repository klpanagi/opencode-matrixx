// Local type definitions mirroring the Matrixx Zod schema
// Source: opencode-matrixx v2.6.4 config schema

export type TierName = "free" | "fast" | "standard" | "premium" | "frontier";

export interface ThinkingConfig {
  type: "enabled" | "disabled";
  budgetTokens?: number;
}

export interface FallbackChainEntry {
  providers: string[];
  model: string;
  variant?: string;
}

export interface AgentPermission {
  edit?: "ask" | "allow" | "deny";
  bash?: "ask" | "allow" | "deny" | Record<string, "ask" | "allow" | "deny">;
  webfetch?: "ask" | "allow" | "deny";
  task?: "ask" | "allow" | "deny";
  doom_loop?: "ask" | "allow" | "deny";
  external_directory?: "ask" | "allow" | "deny";
}

export interface AgentOverrideConfig {
  model?: string;
  tier?: TierName;
  variant?: string;
  category?: string;
  skills?: string[];
  temperature?: number;
  top_p?: number;
  prompt?: string;
  prompt_append?: string;
  tools?: Record<string, boolean>;
  disable?: boolean;
  description?: string;
  mode?: "subagent" | "primary" | "all";
  color?: string;
  permission?: AgentPermission;
  maxTokens?: number;
  thinking?: ThinkingConfig;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh";
  textVerbosity?: "low" | "medium" | "high";
  providerOptions?: Record<string, unknown>;
  fallbackChain?: FallbackChainEntry[];
}

export type AgentOverrides = Partial<Record<string, AgentOverrideConfig>>;

export interface CategoryConfig {
  description?: string;
  model?: string;
  tier?: TierName;
  variant?: string;
  temperature?: number;
  top_p?: number;
  maxTokens?: number;
  thinking?: ThinkingConfig;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh";
  textVerbosity?: "low" | "medium" | "high";
  tools?: Record<string, boolean>;
  prompt_append?: string;
  is_unstable_agent?: boolean;
  disable?: boolean;
  fallback_models?: string | string[];
  complexity_downgrades?: Record<string, string>;
}

export type CategoriesConfig = Record<string, CategoryConfig>;

export interface MorpheusAgentConfig {
  disabled?: boolean;
  default_builder_enabled?: boolean;
  planner_enabled?: boolean;
  replace_plan?: boolean;
}

export interface ExperimentalConfig {
  aggressive_truncation?: boolean;
  auto_resume?: boolean;
  preemptive_compaction?: boolean;
  truncate_all_tool_outputs?: boolean;
  task_system?: boolean;
  plugin_load_timeout_ms?: number;
  context_warning_threshold?: number;
  preemptive_compaction_threshold?: number;
  safe_hook_creation?: boolean;
  hashline_edit?: boolean;
}

export interface DcpProfileSettings {
  pruneNotification?: string;
  compress?: Record<string, unknown>;
  turnProtection?: Record<string, unknown>;
  experimental?: Record<string, unknown>;
  strategies?: Record<string, unknown>;
}

export interface DcpConfig {
  enabled?: boolean;
  default_profile?: string;
  profiles?: Record<string, DcpProfileSettings>;
  base?: Record<string, unknown>;
}

export interface HeadroomConfig {
  enabled?: boolean;
  proxyUrl?: string;
  project?: string;
  backend?: string;
}

export interface ContextModeConfig {
  enabled?: boolean;
  enforce?: boolean;
  blocked_tools?: string[];
}

export interface RtkConfig {
  enabled?: boolean;
  binary_path?: string;
  timeout_ms?: number;
}

export interface BackgroundTaskConfig {
  defaultConcurrency?: number;
  providerConcurrency?: Record<string, number>;
  modelConcurrency?: Record<string, number>;
  staleTimeoutMs?: number;
  messageStalenessTimeoutMs?: number;
  maxToolCalls?: number;
  circuitBreaker?: {
    enabled?: boolean;
    maxToolCalls?: number;
    consecutiveThreshold?: number;
  };
}

export interface CommentCheckerConfig {
  custom_prompt?: string;
}

export interface NotificationConfig {
  force_enable?: boolean;
}

export interface BabysittingConfig {
  timeout_ms?: number;
}

export interface TddEnforcerConfig {
  enabled?: boolean;
}

export interface BrowserAutomationConfig {
  provider?: string;
}

export interface WebsearchConfig {
  provider?: string;
}

export interface TmuxConfig {
  enabled?: boolean;
  layout?: string;
  main_pane_size?: number;
  main_pane_min_width?: number;
  agent_pane_min_width?: number;
}

export interface AssemblyConfig {
  enabled?: boolean;
  providers?: Array<{ providerID: string; modelID: string }>;
  default_voters?: number;
  default_rounds?: number;
  timeout_ms?: number;
}

export interface SecurityConfig {
  secret_scanning?: {
    enabled?: boolean;
    tool?: string;
    block_on_detection?: boolean;
    allowlist_paths?: string[];
  };
  env_file_guard?: {
    enabled?: boolean;
    blocked_patterns?: string[];
    allowed_paths?: string[];
  };
  dependency_audit?: {
    enabled?: boolean;
    on_package_change?: boolean;
  };
  input_secret_guard?: {
    enabled?: boolean;
    mode?: string;
    blocklist_mode?: string;
    warnlist_mode?: string;
    allowlist_patterns?: string[];
  };
}

export interface RuntimeFallbackConfig {
  enabled?: boolean;
  retry_on_errors?: number[];
  max_fallback_attempts?: number;
  cooldown_seconds?: number;
  timeout_seconds?: number;
  notify_on_fallback?: boolean;
}

export interface MorpheusConfig {
  tasks?: {
    scope?: string;
    storage_path?: string;
    task_list_id?: string;
    claude_code_compat?: boolean;
  };
}

export interface MatrixLoopConfig {
  enabled?: boolean;
  default_max_iterations?: number;
  state_dir?: string;
}

export interface SkillsConfig {
  sources?: Array<
    string | { path: string; recursive?: boolean; glob?: string }
  >;
  enable?: string[];
  disable?: string[];
  [key: string]: unknown;
}

export interface MatrixxSelfConfig {
  enabled?: boolean;
  proactive?: boolean;
}

export interface EvolutionConfig {
  enabled?: boolean;
  watcher?: Record<string, unknown>;
  compressor?: Record<string, unknown>;
  writer?: Record<string, unknown>;
  governance?: Record<string, unknown>;
  retention?: Record<string, unknown>;
  budget?: Record<string, unknown>;
}

export interface MatrixxConfig {
  $schema?: string;
  global_model?: string;
  default_tier?: TierName;
  new_task_system_enabled?: boolean;
  default_run_agent?: string;
  auto_update?: boolean;
  disabled_mcps?: string[];
  disabled_agents?: string[];
  disabled_skills?: string[];
  disabled_hooks?: string[];
  disabled_commands?: string[];
  disabled_tools?: string[];
  agents?: AgentOverrides;
  categories?: CategoriesConfig;
  morpheus_agent?: MorpheusAgentConfig;
  comment_checker?: CommentCheckerConfig;
  experimental?: ExperimentalConfig;
  dcp?: DcpConfig;
  headroom?: HeadroomConfig;
  context_mode?: ContextModeConfig;
  rtk?: RtkConfig;
  background_task?: BackgroundTaskConfig;
  morpheus?: MorpheusConfig;
  notification?: NotificationConfig;
  babysitting?: BabysittingConfig;
  tdd_enforcer?: TddEnforcerConfig;
  browser_automation_engine?: BrowserAutomationConfig;
  websearch?: WebsearchConfig;
  tmux?: TmuxConfig;
  assembly?: AssemblyConfig;
  security?: SecurityConfig;
  runtime_fallback?: RuntimeFallbackConfig;
  agent_definitions?: string[];
  matrixx_self_config?: MatrixxSelfConfig;
  matrix_loop?: MatrixLoopConfig;
  skills?: SkillsConfig | string[];
  evolution?: EvolutionConfig;
  _migrations?: string[];
}

export type SectionId =
  "dashboard" | "core" | "agents" | "categories" | "tiers" | "skills";

export interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
  duration?: number;
}
