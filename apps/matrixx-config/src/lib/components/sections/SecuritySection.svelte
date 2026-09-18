<script lang="ts">
  import { configStore } from "$lib/store/config-store"
  import FieldEditor from "$lib/components/config/FieldEditor.svelte"
  import BooleanEditor from "$lib/components/config/BooleanEditor.svelte"
  import EnumEditor from "$lib/components/config/EnumEditor.svelte"
  import NumberEditor from "$lib/components/config/NumberEditor.svelte"
  import ArrayEditor from "$lib/components/config/ArrayEditor.svelte"

  let config = $state(configStore.getSnapshot())
  configStore.subscribe((v) => (config = v))

  const MODE_OPTIONS = [
    { value: "prompt", label: "Prompt" },
    { value: "block", label: "Block" },
    { value: "off", label: "Off" },
  ]
  const BLOCK_OPTIONS = [
    { value: "prompt", label: "Prompt" },
    { value: "block", label: "Block" },
  ]
  const WARN_OPTIONS = [
    { value: "prompt", label: "Prompt" },
    { value: "off", label: "Off" },
  ]
</script>

<div class="section">
  <h2 class="section-title">Security</h2>
  <p class="section-desc">Secret scanning, file guards, dependency audits, and input guards.</p>

  <h3 class="group">Secret Scanning</h3>
  <FieldEditor label="Enabled">
    <BooleanEditor value={config.security?.secret_scanning?.enabled ?? true} onChange={(v) => configStore.updateConfig((c) => ({ ...c, security: { ...c.security, secret_scanning: { ...c.security?.secret_scanning, enabled: v } } }))} label="Scanning" />
  </FieldEditor>
  <FieldEditor label="Block On Detection" advanced>
    <BooleanEditor value={config.security?.secret_scanning?.block_on_detection ?? true} onChange={(v) => configStore.updateConfig((c) => ({ ...c, security: { ...c.security, secret_scanning: { ...c.security?.secret_scanning, block_on_detection: v } } }))} label="Block" />
  </FieldEditor>
  <FieldEditor label="Tool" description="Secret detection tool" advanced>
    <EnumEditor value={config.security?.secret_scanning?.tool ?? ""} options={[{ value: "gitleaks", label: "Gitleaks" }]} onChange={(v) => configStore.updateConfig((c) => ({ ...c, security: { ...c.security, secret_scanning: { ...c.security?.secret_scanning, tool: (v || undefined) as "gitleaks" | undefined } } }))} label="Tool" placeholder="Default (gitleaks)" />
  </FieldEditor>
  <FieldEditor label="Allowlist Paths" description="Glob patterns excluded from scanning" advanced>
    <ArrayEditor value={config.security?.secret_scanning?.allowlist_paths ?? []} onChange={(v) => configStore.updateConfig((c) => ({ ...c, security: { ...c.security, secret_scanning: { ...c.security?.secret_scanning, allowlist_paths: v.length > 0 ? v : undefined } } }))} label="Allowlist" placeholder="glob…" />
  </FieldEditor>

  <h3 class="group">Env File Guard</h3>
  <FieldEditor label="Enabled">
    <BooleanEditor value={config.security?.env_file_guard?.enabled ?? true} onChange={(v) => configStore.updateConfig((c) => ({ ...c, security: { ...c.security, env_file_guard: { ...c.security?.env_file_guard, enabled: v } } }))} label="Guard" />
  </FieldEditor>
  <FieldEditor label="Blocked Patterns" advanced>
    <ArrayEditor value={config.security?.env_file_guard?.blocked_patterns ?? []} onChange={(v) => configStore.updateConfig((c) => ({ ...c, security: { ...c.security, env_file_guard: { ...c.security?.env_file_guard, blocked_patterns: v } } }))} label="Blocked" placeholder=".env…" />
  </FieldEditor>
  <FieldEditor label="Allowed Paths" advanced>
    <ArrayEditor value={config.security?.env_file_guard?.allowed_paths ?? []} onChange={(v) => configStore.updateConfig((c) => ({ ...c, security: { ...c.security, env_file_guard: { ...c.security?.env_file_guard, allowed_paths: v.length > 0 ? v : undefined } } }))} label="Allowed" placeholder="path…" />
  </FieldEditor>

  <h3 class="group">Dependency Audit</h3>
  <FieldEditor label="Enabled">
    <BooleanEditor value={config.security?.dependency_audit?.enabled ?? false} onChange={(v) => configStore.updateConfig((c) => ({ ...c, security: { ...c.security, dependency_audit: { ...c.security?.dependency_audit, enabled: v } } }))} label="Audit" />
  </FieldEditor>
  <FieldEditor label="On Package Change" advanced>
    <BooleanEditor value={config.security?.dependency_audit?.on_package_change ?? true} onChange={(v) => configStore.updateConfig((c) => ({ ...c, security: { ...c.security, dependency_audit: { ...c.security?.dependency_audit, on_package_change: v } } }))} label="On change" />
  </FieldEditor>

  <h3 class="group">Input Secret Guard</h3>
  <FieldEditor label="Enabled">
    <BooleanEditor value={config.security?.input_secret_guard?.enabled ?? true} onChange={(v) => configStore.updateConfig((c) => ({ ...c, security: { ...c.security, input_secret_guard: { ...c.security?.input_secret_guard, enabled: v } } }))} label="Input guard" />
  </FieldEditor>
  <FieldEditor label="Mode" advanced>
    <EnumEditor value={config.security?.input_secret_guard?.mode ?? ""} options={MODE_OPTIONS} onChange={(v) => configStore.updateConfig((c) => ({ ...c, security: { ...c.security, input_secret_guard: { ...c.security?.input_secret_guard, mode: (v || undefined) as "prompt" | "block" | "off" | undefined } } }))} label="Mode" placeholder="Default (prompt)" />
  </FieldEditor>
  <FieldEditor label="Blocklist Mode" advanced>
    <EnumEditor value={config.security?.input_secret_guard?.blocklist_mode ?? ""} options={BLOCK_OPTIONS} onChange={(v) => configStore.updateConfig((c) => ({ ...c, security: { ...c.security, input_secret_guard: { ...c.security?.input_secret_guard, blocklist_mode: (v || undefined) as "prompt" | "block" | undefined } } }))} label="Blocklist" placeholder="Default" />
  </FieldEditor>
  <FieldEditor label="Warnlist Mode" advanced>
    <EnumEditor value={config.security?.input_secret_guard?.warnlist_mode ?? ""} options={WARN_OPTIONS} onChange={(v) => configStore.updateConfig((c) => ({ ...c, security: { ...c.security, input_secret_guard: { ...c.security?.input_secret_guard, warnlist_mode: (v || undefined) as "prompt" | "off" | undefined } } }))} label="Warnlist" placeholder="Default" />
  </FieldEditor>
  <FieldEditor label="Allowlist Patterns" advanced>
    <ArrayEditor value={config.security?.input_secret_guard?.allowlist_patterns ?? []} onChange={(v) => configStore.updateConfig((c) => ({ ...c, security: { ...c.security, input_secret_guard: { ...c.security?.input_secret_guard, allowlist_patterns: v.length > 0 ? v : undefined } } }))} label="Allowlist" placeholder="pattern…" />
  </FieldEditor>
  <FieldEditor label="Entropy Threshold (0-8)" advanced>
    <NumberEditor value={config.security?.input_secret_guard?.detection?.entropy_threshold ?? 4.5} onChange={(v) => configStore.updateConfig((c) => ({ ...c, security: { ...c.security, input_secret_guard: { ...c.security?.input_secret_guard, detection: { ...c.security?.input_secret_guard?.detection, entropy_threshold: v } } } }))} label="Entropy" min={0} max={8} step={0.1} showSlider />
  </FieldEditor>
  <FieldEditor label="Max Scan Bytes" advanced>
    <NumberEditor value={config.security?.input_secret_guard?.detection?.max_scan_bytes ?? 65536} onChange={(v) => configStore.updateConfig((c) => ({ ...c, security: { ...c.security, input_secret_guard: { ...c.security?.input_secret_guard, detection: { ...c.security?.input_secret_guard?.detection, max_scan_bytes: v } } } }))} label="Scan bytes" min={1024} max={262144} step={1024} />
  </FieldEditor>
</div>

<style>
  .section { max-width: 48rem; }
  .section-title { font-size: 1.25rem; font-weight: 700; color: var(--color-text-primary); margin: 0 0 0.25rem; }
  .section-desc { font-size: 0.875rem; color: var(--color-text-secondary); margin: 0 0 1rem; }
  .group { font-size: 0.9375rem; font-weight: 600; margin: 1.5rem 0 0.75rem; }
</style>
