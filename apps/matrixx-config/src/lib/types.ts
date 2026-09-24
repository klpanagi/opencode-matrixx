// Local type definitions mirroring the Matrixx Zod schema
// Source: opencode-matrixx current config schema (dev)

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

export interface ModelPresetEntry {
  model: string;
  variant?: string;
}

export interface ModelPreset {
  default_model?: string;
  agents?: Record<string, ModelPresetEntry>;
  categories?: Record<string, ModelPresetEntry>;
}

export type ModelPresets = Record<string, ModelPreset>;

export interface ModelFallbackEntry {
  providers: string[];
  model: string;
  variant?: string;
}

export interface ModelRequirementEntry {
  fallbackChain: ModelFallbackEntry[];
  requiresModel?: string;
  requiresAnyModel?: boolean;
  requiresProvider?: string[];
  variant?: string;
}

export interface ModelRequirements {
  agents?: Record<string, ModelRequirementEntry>;
  categories?: Record<string, ModelRequirementEntry>;
}

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

export interface DcpCompressOverride {
  maxContextLimit?: number | string;
  minContextLimit?: number | string;
  nudgeFrequency?: number;
  iterationNudgeThreshold?: number;
  nudgeForce?: "strong" | "soft";
  protectTags?: boolean;
  protectedTools?: string[];
  protectUserMessages?: boolean;
}

export interface DcpTurnProtection {
  enabled?: boolean;
  turns?: number;
}

export interface DcpExperimental {
  allowSubAgents?: boolean;
}

export interface DcpProfileSettings {
  pruneNotification?: "off" | "minimal" | "detailed";
  compress?: DcpCompressOverride;
  turnProtection?: DcpTurnProtection;
  experimental?: DcpExperimental;
  strategies?: { purgeErrors?: { turns?: number } };
}

export type DcpProfileDefinition = DcpProfileSettings;

export interface DcpConfig {
  enabled?: boolean;
  default_profile?: string;
  profiles?: Record<string, DcpProfileSettings>;
  handoffCompression?: {
    enabled?: boolean;
    maxMessages?: number;
    keepFirst?: number;
    keepLast?: number;
  };
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
  admissionTimeoutMs?: number;
  nestedAdmission?: {
    enabled?: boolean;
    mode?: "bypass" | "reserve";
    maxDepth?: number;
  };
  wakeScheduler?: { enabled?: boolean; intervalMs?: number };
  jobBoard?: {
    enabled?: boolean;
    strategy?: "latest" | "checkpoint-compatible";
    maxRetainedSnapshots?: number;
  };
  wallClockTimeoutMs?: number;
  wallClockAbortGraceMs?: number;
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
    detection?: { entropy_threshold?: number; max_scan_bytes?: number };
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
    scope?: "global" | "project";
    storage_path?: string;
    task_list_id?: string;
    stale_after_hours?: number;
    session_scoped?: boolean;
  };
}

export interface MatrixLoopConfig {
  enabled?: boolean;
  default_max_iterations?: number;
  state_dir?: string;
}

export interface KnowledgeHub {
  name: string;
  path: string;
  index?: string;
  scope?: "global" | "project";
  mode?: "router-only" | "pinned";
  exclude?: string[];
}

export interface KnowledgeConfig {
  hubs?: KnowledgeHub[];
}

export interface TasksConfig {
  enabled?: boolean;
  scope?: "global" | "project";
  storage_path?: string;
  task_list_id?: string;
  stale_after_hours?: number;
  session_scoped?: boolean;
  pollTimeoutMs?: number;
}

export interface TaskLegacyConfig {
  pollTimeoutMs?: number;
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

export interface EvolutionWatcherConfig {
  maxArgChars?: number;
  maxOutputChars?: number;
  skipTools?: string[];
}

export interface EvolutionCompressorConfig {
  provider?: "llm" | "dspy-gepa";
  model?: string;
  minTraces?: number;
  maxInputTokens?: number;
  trigger?: "compacting" | "idle" | "both";
}

export interface EvolutionWriterConfig {
  outputDir?: string;
  globalSkills?: boolean;
  allowToolGeneration?: boolean;
  allowAgentGeneration?: boolean;
}

export interface EvolutionGovernanceConfig {
  requireApproval?: boolean;
  autoPromote?: boolean;
  autoPromoteThreshold?: number;
  minConfidence?: number;
}

export interface EvolutionRetentionConfig {
  traceDays?: number;
  maxPending?: number;
}

export interface EvolutionBudgetConfig {
  maxCompressionsPerHour?: number;
  maxCostCentsPerDay?: number;
}

export interface EvolutionConfig {
  enabled?: boolean;
  watcher?: EvolutionWatcherConfig;
  compressor?: EvolutionCompressorConfig;
  writer?: EvolutionWriterConfig;
  governance?: EvolutionGovernanceConfig;
  retention?: EvolutionRetentionConfig;
  budget?: EvolutionBudgetConfig;
}

export interface MatrixxConfig {
  $schema?: string;
  global_model?: string;
  model_presets?: ModelPresets;
  active_preset?: string;
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
  tasks?: TasksConfig;
  task?: TaskLegacyConfig;
  knowledge?: KnowledgeConfig;
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
  modelRequirements?: ModelRequirements;
  complexityDowngrades?: Record<string, Record<string, string>>;
}

export type SectionId =
  | "dashboard"
  | "core"
  | "models"
  | "agents"
  | "categories"
  | "tasks"
  | "features"
  | "background"
  | "security"
  | "dcp"
  | "knowledge"
  | "advanced";

export interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
  duration?: number;
}
