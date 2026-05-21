# Deep Dive 4: Per-Vessel Config System

> **Bridge × Pi Integration — Model, tools, skills, and behavior config per project**
> **Status:** Implementation-ready spec + UX interaction design
> **Scope:** Global defaults → Vessel overrides → Launch-time finalization pipeline

---

## 1. THE CONFIGURATION CHAIN

```
┌─────────────────────────────────────────────────────────────┐
│                    CONFIG RESOLUTION PIPELINE                │
│                                                             │
│  User launches Pi on "web-dev-cody"                         │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────┐                                       │
│  │ BridgeConfig    │  Global defaults (Helm → General tab)  │
│  │ (global)        │  · pi binary path                      │
│  │                 │  · default provider, model              │
│  │                 │  · default thinking level               │
│  │                 │  · default tool allowlist               │
│  │                 │  · global skills, extensions           │
│  └────────┬────────┘                                       │
│           │ Inherit = true? (default)                       │
│           ▼                                                 │
│  ┌─────────────────┐                                       │
│  │ VesselPiConfig  │  Per-project overrides                  │
│  │ (per-vessel)    │  · Different model for this project     │
│  │                 │  · Project-specific skills (.nextjs.sk)  │
│  │                 │  · Restricted tools (no bash in prod)   │
│  │                 │  · Auto-attach context files            │
│  └────────┬────────┘                                       │
│           │                                                 │
│           ▼                                                 │
│  ┌─────────────────┐                                       │
│  │ PiLaunchConfig  │  Final resolved config for THIS launch │
│  │ (resolved)      │  · Every field has a concrete value    │
│  │                 │  · Built by resolve_config()            │
│  └────────┬────────┘                                       │
│           │                                                 │
│           ▼                                                 │
│  ┌─────────────────┐                                       │
│  │ CLI Args         │  pi --provider zai --model glm-5v    │
│  │ (actual command) │  --thinking medium -p "..."             │
│  │                 │  --skill ./nextjs.sk @AGENTS.md        │
│  └─────────────────┘                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Key principle:** Every vessel can override any setting from the global default. But most vessels will inherit most settings — only changing what's different about that project.

---

## 2. DATA MODEL

### 2.1 Complete Configuration Schema

```rust
use serde::{Deserialize, Serialize};

// ═══════════════════════════════════════════
// GLOBAL CONFIG (stored in SQLite `settings` table or JSON file)
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeConfig {
    // ── Pi Binary ──
    pub pi_binary_path: String,          // Path to `pi` executable (auto-detected by default)

    // ── Default Model (used when vessel doesn't override) ──
    pub default_provider: Option<String>, // e.g., "zai", "anthropic", "openai"
    pub default_model: Option<String>,    // e.g., "glm-5v-turbo", "claude-sonnet-4-20250514"
    pub default_thinking_level: Option<String>, // "off" | "minimal" | "low" | "medium" | "high" | "xhigh"

    // ── Default Tool Policy ──
    pub default_tool_policy: ToolPolicy,

    // ── Global Skills & Extensions ──
    pub global_skills: Vec<String>,        // Paths to skill files (loaded for ALL sessions)
    pub global_extensions: Vec<String>,     // Paths to extension files (loaded for ALL sessions)

    // ── Session Management ──
    pub session_dir: Option<String>,        // Custom dir for Bridge-launched sessions
    pub isolate_sessions: bool,             // Use separate session dir for Bridge (recommended: true)

    // ── UI Defaults ──
    pub theme: ThemeChoice,
    pub auto_scroll_terminal: bool,
    pub show_thinking_by_default: bool,
    pub compact_mode_default: bool,

    // ── Cost & Budget ──
    pub default_budget: VesselBudget,       // Template applied to new vessels

    // ── Git ──
    pub git_auto_refresh_seconds: u32,

    // ── Window ──
    pub remember_window_geometry: bool,
    pub start_minimized: bool,
}

/// How tools are allowed/denied by default
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ToolPolicy {
    AllowAll,                            // All built-in + extension tools available
    AllowList(Vec<String>),             // Only these specific tools
    DenyList(Vec<String>),              // All EXCEPT these specific tools
    None,                                // No tools (--no-tools flag)
}

impl Default for ToolPolicy {
    fn default() -> Self { ToolPolicy::AllowAll }
}

impl Default for BridgeConfig {
    fn default() -> Self {
        BridgeConfig {
            pi_binary_path: "pi".into(),       // Look in PATH
            default_provider: None,              // Pi's own default
            default_model: None,                // Pi's own default
            default_thinking_level: Some("medium".into()),
            default_tool_policy: ToolPolicy::AllowAll,
            global_skills: Vec::new(),
            global_extensions: Vec::new(),
            session_dir: None,
            isolate_sessions: true,
            theme: ThemeChoice::MonokaiPro,
            auto_scroll_terminal: true,
            show_thinking_by_default: true,
            compact_mode_default: false,
            default_budget: VesselBudget::default(),
            git_auto_refresh_seconds: 10,
            remember_window_geometry: true,
            start_minimized: false,
        }
    }
}

// ═══════════════════════════════════════════
// PER-VESSEL CONFIG (stored alongside vessel record)
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VesselPiConfig {
    /// If true (default), unset fields inherit from BridgeConfig.
    /// If false, ONLY explicit fields are used (all others are Pi defaults).
    pub inherit_global: bool,

    // ── Model Overrides ──
    pub provider: Option<String>,
    pub model: Option<String>,
    pub thinking_level: Option<String>,

    // ── Tool Override ──
    pub tool_policy: Option<ToolPolicy>,

    // ── Project-Specific Skills ──
    /// Paths relative to vessel root (resolved at launch time).
    /// These are IN ADDITION to global skills.
    pub vessel_skills: Vec<String>,

    /// Same for extensions.
    pub vessel_extensions: Vec<String>,

    // ── Context Files ──
    /// Always attached as @file arguments to every Pi launch on this vessel.
    pub auto_context_files: Vec<String>,     // e.g., ["AGENTS.md", "CLAUDE.md", "docs/PLAN.md"]

    // ── Quick Actions ──
    /// Saved prompt templates for this vessel's launch bar.
    pub quick_prompts: Vec<QuickPrompt>,

    // ── Pre-launch Hook ──
    /// Bash command to run BEFORE launching Pi (e.g., "npm install").
    /// Runs in vessel directory. Failure blocks launch.
    pub pre_launch_hook: Option<String>,

    // ── Post-exit Hook ──
    /// Bash command to run AFTER Pi exits (e.g., "npm test").
    pub post_exit_hook: Option<String>,

    // ── Budget Override ──
    pub budget: Option<VesselBudget>,
}

impl Default for VesselPiConfig {
    fn default() -> Self {
        VesselPiConfig {
            inherit_global: true,
            provider: None,
            model: None,
            thinking_level: None,
            tool_policy: None,
            vessel_skills: Vec::new(),
            vessel_extensions: Vec::new(),
            auto_context_files: Vec::new(),
            quick_prompts: Vec::new(),
            pre_launch_hook: None,
            post_exit_hook: None,
            budget: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuickPrompt {
    pub id: Uuid,
    pub name: String,                     // "Feature implementation"
    pub prompt_template: String,           // "Implement {ticket_description} following our patterns"
    pub icon: Option<String>,             // "🚀"
    pub sort_order: usize,
    pub is_default: bool,                 // True = used when user clicks "Launch" without typing
}

// ═══════════════════════════════════════════
// RESOLVED LAUNCH CONFIG (output of resolution pipeline)
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PiLaunchConfig {
    // Fully resolved — no Option fields (except where Pi accepts "not set")
    pub provider: Option<String>,
    pub model: Option<String>,
    pub thinking_level: Option<String>,
    pub system_prompt: Option<String>,
    pub append_system_prompt: Option<String>,

    // Resolved tool policy → CLI args
    pub tools_cli_args: Vec<String>,       // e.g., ["--tools", "read,bash,edit"]
    pub no_tools_flag: bool,

    // Resolved skill paths (absolute, verified to exist)
    pub skill_paths: Vec<String>,
    pub extension_paths: Vec<String>,

    // Context files (absolute paths)
    pub context_file_paths: Vec<String>,

    // Session control
    pub session_id: Option<String>,
    pub fork_session_id: Option<String>,
    pub no_session: bool,
    pub session_dir: Option<String>,

    // The actual prompt
    pub initial_prompt: Option<String>,

    // Hooks
    pub pre_launch_hook: Option<String>,
    pub post_exit_hook: Option<String>,

    // For display/logging
    pub source_description: String,       // "global + vessel(web-dev-cody) overrides"
}
```

### 2.2 Config Resolution Algorithm

```rust
/// Resolve the final PiLaunchConfig for a given vessel.
///
/// Resolution order (later wins):
///   1. BridgeConfig (global defaults)
///   2. VesselPiConfig (per-vessel overrides)
///   3. Launch-time parameters (from frontend invocation)
pub fn resolve_config(
    global: &BridgeConfig,
    vessel_config: &VesselPiConfig,
    vessel_path: &Path,
    launch_overrides: &LaunchOverrides,
) -> Result<PiLaunchConfig, BridgeError> {
    let mut source_parts: Vec<&str> = Vec::new();

    // ── Step 1: Start with globals ──
    let provider = global.default_provider.clone();
    let model = global.default_model.clone();
    let thinking = global.default_thinking_level.clone();
    let tool_policy = global.default_tool_policy.clone();
    let mut skill_paths: Vec<String> = global.global_skills.iter()
        .map(|s| resolve_path(s, vessel_path))
        .collect::<Result<Vec<_>, _>>()?;
    let mut extension_paths: Vec<String> = global.global_extensions.iter()
        .map(|e| resolve_path(e, vessel_path))
        .collect::<Result<Vec<_>, _>>()?;
    source_parts.push("global");

    // ── Step 2: Apply vessel overrides (if inheriting) ──
    if vessel_config.inherit_global {
        source_parts.push(&format!("vessel({})", vessel_path.file_name()
            .unwrap_or_default().to_string_lossy()));

        // Each Some(_) override replaces the global; None keeps global
        // (This is different from normal merge — None means "I don't have an opinion")
    }

    let final_provider = vessel_config.provider.or(provider);
    let final_model = vessel_config.model.or(model);
    let final_thinking = vessel_config.thinking_level.or(thinking);
    let final_tool_policy = vessel_config.tool_policy.as_ref()
        .unwrap_or(&tool_policy);

    // Add vessel-specific skills/extensions (on top of globals)
    for skill in &vessel_config.vessel_skills {
        skill_paths.push(resolve_path(skill, vessel_path)?);
    }
    for ext in &vessel_config.vessel_extensions {
        extension_paths.push(resolve_path(ext, vessel_path)?);
    }

    // Resolve context files
    let mut context_files: Vec<String> = Vec::new();
    for cf in &vessel_config.auto_context_files {
        let full = vessel_path.join(cf);
        if full.exists() {
            context_files.push(full.to_string_lossy().to_string());
        } else {
            // Warn but don't fail — context file might not exist yet
            eprintln!("Warning: context file not found: {}", full.display());
        }
    }

    // ── Step 3: Apply launch-time overrides (highest priority) ──
    let final_provider = launch_overrides.provider.or(final_provider);
    let final_model = launch_overrides.model.or(final_model);
    let final_thinking = launch_overrides.thinking_level.or(final_thinking);

    if let Some(ref tools) = launch_overrides.tools {
        // Launch-time tools completely replace resolved policy
    }

    // ── Step 4: Build CLI args from tool policy ──
    let (tools_args, no_tools) = match final_tool_policy {
        ToolPolicy::AllowAll => (Vec::new(), false),
        ToolPolicy::AllowList(list) => (
            vec!["--tools".into(), list.join(",")],
            false,
        ),
        ToolPolicy::DenyList(deny) => (
            vec!["--tools".into(), all_tool_names_except(&deny)],
            false,
        ),
        ToolPolicy::None => (Vec::new(), true),
    };

    // ── Step 5: Build session dir ──
    let session_dir = if global.isolate_sessions {
        Some(format!("{}/bridge-sessions",
            global.session_dir.as_deref().unwrap_or({
                // Default to within Bridge's own data dir
                dirs::data_dir()
                    .unwrap_or_else(|| PathBuf::from("/tmp"))
                    .join("bridge")
                    .to_string_lossy().into_owned()
            }))
        )
    } else {
        global.session_dir.clone()
    };

    // ── Assemble ──
    Ok(PiLaunchConfig {
        provider: final_provider,
        model: final_model,
        thinking_level: final_thinking,
        system_prompt: launch_overrides.system_prompt.clone(),
        append_system_prompt: launch_overrides.append_system_prompt.clone(),
        tools_cli_args: tools_args,
        no_tools_flag: no_tools,
        skill_paths,
        extension_paths,
        context_file_paths: context_files,
        session_id: launch_overrides.session_id.clone(),
        fork_session_id: launch_overrides.fork_session_id.clone(),
        no_session: launch_overrides.no_session,
        session_dir,
        initial_prompt: launch_overrides.prompt.clone(),
        pre_launch_hook: vessel_config.pre_launch_hook.clone()
            .or(launch_overrides.pre_launch_hook.clone()),
        post_exit_hook: vessel_config.post_exit_hook.clone(),
        source_description: source_parts.join(" + "),
    })
}

fn resolve_path(path_str: &str, base: &Path) -> Result<String, BridgeError> {
    let p = PathBuf::from(path_str);
    if p.is_absolute() {
        Ok(p.to_string_lossy().to_string())
    } else {
        let resolved = base.join(&p);
        if !resolved.exists() {
            return Err(BridgeError::ConfigError(format!(
                "Skill/extension path not found: {} (resolved to {})",
                path_str, resolved.display()
            )));
        }
        Ok(resolved.to_string_lossy().to_string())
    }
}

fn all_tool_names_except(deny: &[String]) -> String {
    const ALL_TOOLS: &[&str] = &["read", "bash", "edit", "write", "grep", "find", "ls"];
    ALL_TOOLS.iter()
        .filter(|t| !deny.contains(&t.to_string()))
        .copied()
        .collect::<Vec<_>>()
        .join(",")
}

/// Launch-time overrides (from the frontend "Launch Pi" dialog)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LaunchOverrides {
    pub provider: Option<String>,
    pub model: Option<String>,
    pub thinking_level: Option<String>,
    pub tools: Option<Vec<String>>,
    pub prompt: Option<String>,
    pub system_prompt: Option<String>,
    pub append_system_prompt: Option<String>,
    pub session_id: Option<String>,
    pub fork_session_id: Option<String>,
    pub no_session: bool,
    pub pre_launch_hook: Option<String>,
}
```

### 2.3 Config → CLI Builder

```rust
/// Convert a resolved PiLaunchConfig into actual CLI arguments.
pub fn build_pi_command(
    config: &PiLaunchConfig,
    vessel_path: &Path,
    mode: PiMode,
) -> Result<std::process::Command, BridgeError> {
    let pi_path = &config.pi_binary_path; // Comes from global config

    let mut cmd = std::process::Command::new(pi_path);
    cmd.current_dir(vessel_path)
       .env("GIT_TERMINAL_PROMPT", "0")
       .env("GIT_EDITOR", ":")
       .env("GIT_PAGER", "cat");

    // Mode
    match mode {
        PiMode::Json => { cmd.arg("--mode").arg("json"); cmd.arg("-p"); }
        PiMode::PtyInteractive => { /* No mode flag needed for interactive */ }
    }

    // Provider / Model
    if let Some(ref provider) = config.provider {
        cmd.arg("--provider").arg(provider);
    }
    if let Some(ref model) = config.model {
        cmd.arg("--model").arg(model);
    }

    // Thinking
    if let Some(ref level) = config.thinking_level {
        cmd.arg("--thinking").arg(level);
    }

    // Tools
    if config.no_tools_flag {
        cmd.arg("--no-tools");
    } else if !config.tools_cli_args.is_empty() {
        cmd.args(&config.tools_cli_args);
    }

    // Skills
    for skill in &config.skill_paths {
        cmd.arg("--skill").arg(skill);
    }
    if !config.skill_paths.is_empty() {
        // Only add --no-skills flag if we have explicit skills to load
        // Otherwise use Pi's default discovery
    }

    // Extensions
    for ext in &config.extension_paths {
        cmd.arg("--extension").arg(ext);
    }

    // Context files
    for cf in &config.context_file_paths {
        cmd.arg(&format!("@{}", cf));
    }

    // System prompts
    if let Some(ref sp) = config.system_prompt {
        cmd.arg("--system-prompt").arg(sp);
    }
    if let Some(ref asp) = config.append_system_prompt {
        cmd.arg("--append-system-prompt").arg(asp);
    }

    // Session control
    if let Some(ref sid) = config.session_id {
        cmd.arg("--session").arg(sid);
    }
    if let Some(ref fsid) = config.fork_session_id {
        cmd.arg("--fork").arg(fsid);
    }
    if config.no_session {
        cmd.arg("--no-session");
    }
    if let Some(ref sdir) = config.session_dir {
        cmd.arg("--session-dir").arg(sdir);
    }

    // Prompt (for JSON mode)
    if let Some(ref prompt) = config.initial_prompt {
        cmd.arg(prompt);
    }

    // Stdio based on mode
    match mode {
        PiMode::Json => {
            cmd.stdout(Stdio::piped())
               .stderr(Stdio::piped());
        }
        PiMode::PtyInteractive => {
            // PTY handled separately in terminal.rs
        }
    }

    Ok(cmd)
}
```

---

## 3. IPC COMMANDS FOR CONFIG

```rust
// ── Global Config ──

#[tauri::command]
async fn config_get() -> Result<BridgeConfig, BridgeError>

#[tauri::command]
async fn config_update(partial: ConfigUpdatePartial) -> Result<(), BridgeError>
// Accepts partial update — only provided fields are changed

#[tauri::command]
async fn config_reset() -> Result<(), BridgeError>
// Restore all defaults

#[tauri::command]
async fn config_validate() -> Result<ValidationReport, BridgeError>
// Check pi binary exists, skills are reachable, etc.

#[derive(Deserialize)]
pub struct ConfigUpdatePartial {
    pub pi_binary_path: Option<String>,
    pub default_provider: Option<String>,
    pub default_model: Option<String>,
    pub default_thinking_level: Option<String>,
    pub default_tool_policy: Option<ToolPolicy>,
    pub global_skills: Option<Vec<String>>,
    pub global_extensions: Option<Vec<String>>,
    pub session_dir: Option<String>,
    pub isolate_sessions: Option<bool>,
    pub theme: Option<ThemeChoice>,
    pub show_thinking_by_default: Option<bool>,
    pub git_auto_refresh_seconds: Option<u32>,
    pub default_budget: Option<VesselBudget>,
}

#[derive(Serialize)]
pub struct ValidationReport {
    pub valid: bool,
    pub checks: Vec<ValidationCheck>,
}

#[derive(Serialize)]
pub struct ValidationCheck {
    pub name: String,                   // "Pi binary"
    pub passed: bool,
    pub message: String,                // "Found at /opt/homebrew/bin/pi v1.2.3"
    pub severity: ValidationSeverity,   // Error | Warning | Info
}

#[derive(Serialize, PartialEq)]
pub enum ValidationSeverity { Error, Warning, Info }

// ── Per-Vessel Config ──

#[tauri::command]
async fn vessel_config_get(vessel_id: Uuid) -> Result<VesselPiConfig, BridgeError>

#[tauri::command]
async fn vessel_config_set(vessel_id: Uuid, config: VesselPiConfig) -> Result<(), BridgeError>

#[tauri::command]
async fn vessel_config_reset(vessel_id: Uuid) -> Result<(), BridgeError>
// Reset to defaults (inherit_global: true, all None)

#[tauri::command]
async fn vessel_config_copy(source_vessel: Uuid, target_vessel: Uuid) -> Result<(), BridgeError>
// Copy config from one vessel to another

#[tauri::command]
async fn vessel_quick_prompts_add(vessel_id: Uuid, prompt: QuickPrompt) -> Result<(), BridgeError>

#[tauri::command]
async fn vessel_quick_prompts_remove(vessel_id: Uuid, prompt_id: Uuid) -> Result<(), BridgeError>

#[tauri::command]
async fn vessel_quick_prompts_reorder(
    vessel_id: Uuid,
    prompt_ids: Vec<Uuid>,
) -> Result<(), BridgeError>

// ── Preview (dry-run) ──

#[tauri::command]
async fn config_preview_resolve(
    vessel_id: Uuid,
    overrides: Option<LaunchOverrides>,
) -> Result<ResolvePreview, BridgeError>
// Show what the resolved config would look like WITHOUT launching

#[derive(Serialize)]
pub struct ResolvePreview {
    pub vessel_name: String,
    pub resolved: PiLaunchConfig,
    pub cli_command: String,              // The actual command that would be run
    pub cli_args: Vec<String>,           // Individual args for display
    pub resolution_trace: Vec<ResolutionStep>,
}

#[derive(Serialize)]
pub struct ResolutionStep {
    pub setting: String,
    pub value: String,
    pub source: String,                  // "global" | "vessel" | "launch" | "pi-default"
}
```

---

## 4. FRONTEND: SETTINGS UI

### 4.1 Helm Settings Panel (Global)

Accessible via bottom nav **⚙ Helm** button:

```
┌─ ⚙ Helm — Bridge Settings ───────────────────────────────────┐
│                                                                │
│  [General] [Pi] [Git] [Appearance] [Advanced]                 │
│                                                                │
│  ═══ PI TAB ═══                                               │
│                                                                │
│  Pi Binary                                                      │
│  ┌──────────────────────────┬──────────┐                      │
│  │ [📂 /opt/homebrew/bin/pi] [Auto-detect]                    │
│  │ ✅ Found pi v2.1.0                                  [✓ OK] │
│  └──────────────────────────┴──────────┘                      │
│                                                                │
│  Default Model                                                  │
│  ┌────────────────┐  ┌──────────────────────┐                 │
│  │ Provider:      │  │ Model:                │                 │
│  │ [zai        ▼]  │  [glm-5v-turbo     ▼]  │                 │
│  │ (Pi's default) │  │ (Pi's default)        │                 │
│  └────────────────┘  └──────────────────────┘                 │
│  ┌────────────────┐                                           │
│  │ Thinking Level: │                                           │
│  │ [medium     ▼]  │ off | minimal | low | medium | high | xhigh│
│  └────────────────┘                                           │
│                                                                │
│  Default Tool Access                                          │
│  ○ Allow all tools (recommended)                              │
│  ○ Only allow: [read, bash, edit, write        ]              │
│  ○ Allow all except: [                                 ]              │
│  ○ Disable all tools                                          │
│                                                                │
│  Global Skills & Extensions                                    │
│  ┌──────────────────────────────────────────────────────┐     │
│  │ 📄 ~/.pi/skills/debugging.sk        [✕ Remove]       │     │
│  │ 📄 ~/.pi/skills/tdd.sk              [✕ Remove]       │     │
│  │                                                      │     │
│  │ [+ Add skill path...]                               │     │
│  └──────────────────────────────────────────────────────┘     │
│  ┌──────────────────────────────────────────────────────┐     │
│  │ 🔌 gitnexus-mcp                             [✕ Remove]│     │
│  │                                                      │     │
│  │ [+ Add extension path...]                          │     │
│  └──────────────────────────────────────────────────────┘     │
│                                                                │
│  Session Storage                                               │
│  ☑ Isolate Bridge sessions (use separate session dir)         │
│  Session dir: [~/.pi/agent/sessions-bridge    Browse...]      │
│                                                                │
│  Default Budget (template for new vessels)                    │
│  ☑ Enable budget monitoring                                   │
│  Per session: [$5.00 ]  Per day: [$20.00]  Per month: [$100] │
│  Warning at: [80%] ████● When limit: [Warn only ▼]           │
│                                                                │
│                           [Save Changes]  [Reset to Defaults] │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 4.2 Vessel Settings Panel (Per-Project)

Accessible via **⚙ gear icon** on any vessel card:

```
┌─ ⚙ web-dev-cody — Configuration ────────────────────────────┐
│                                                                 │
│  ☑ Inherit global settings (uncheck to customize everything)   │
│                                                                 │
│  ── Model (overrides global) ──────────────────────────────   │
│  Provider: [zai (same as global)]                        ▼   │
│  Model:   [glm-5v-turbo (same as global)               ▼   │
│  Thinking:[medium (same as global)                     ▼]   │
│                                                                 │
│  ── Tools (overrides global) ────────────────────────────   │
│  ○ Use global setting (allow all)                             │
│  ○ Custom:                                                   │
│     ☑ read  ☑ write  ☑ edit  ☑ bash  ☑ grep  ☑ find  ☑ ls  │
│                                                                 │
│  ── Project Skills ─────────────────────────────────────   │
│  Skills loaded IN ADDITION to global skills:                 │
│  📄 ./nextjs.sk  (Next.js App Router patterns)  [✕]        │
│  📄 ./testing.sk (TDD workflow)                [✕]        │
│  [+ Add skill relative to project...]                         │
│                                                                 │
│  ── Auto-Attach Context Files ─────────────────────────   │
│  These files are included with every Pi launch:              │
│  📄 AGENTS.md                                    [✕]        │
│  📄 CLAUDE.md                                   [✕]        │
│  📄 docs/api-conventions.md                      [✕]        │
│  [+ Add file...]                                            │
│                                                                 │
│  ── Quick Prompts ─────────────────────────────────────   │
│  Saved launch templates:                                      │
│  ┌────────────────────────────────────────────────────┐     │
│  │ 🚀 Feature impl  "Implement following patterns..."  │     │
│  │ 🐛 Bug fix        "Fix: {description}..."           │     │
│  │ 📝 Refactor       "Refactor {area} for..."          │     │
│  │ ✅ Test coverage  "Add tests for {file}..."         │     │
│  │ [+ New template...]                                 │     │
│  └────────────────────────────────────────────────────┘     │
│                                                                 │
│  ── Hooks ─────────────────────────────────────────────   │
│  Pre-launch:  [npm install __________________] OK           │
│  Post-exit:   [                              ] (optional)   │
│                                                                 │
│  ── Budget (overrides global template) ───────────────   │
│  ☑ Enable (separate from global default)                     │
│  Session: [$5.00]  Day: [$50.00]  Month: [$500]            │
│                                                                 │
│  ── Danger Zone ─────────────────────────────────────   │
│  🔄 Reset to inherited                                     │
│  📋 Copy config from another vessel: [Choose vessel ▼]     │
│                                                                 │
│                              [Save]  [Cancel]                │
│                                                                 │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Launch Dialog (Uses Resolved Config)

When user clicks **▶ Launch Pi**:

```
┌─ Launch Pi — web-dev-cody ───────────────────────────────────┐
│                                                                  │
│  Prompt                                                          │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Add an about page with Next.js App Router and link it   │    │
│  │ in the header navigation                                  │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Or use a quick prompt:                                        │
│  [🚀 Feature impl] [🐛 Bug fix] [📝 Refactor] [✅ Tests] [+..]  │
│                                                                  │
│  ── Configuration (resolved) ──────────────────────────────    │
│                                                                  │
│  Mode:     ● Structured (see execution view)  ○ Terminal       │
│  Model:    zai / glm-5v-turbo / medium                        │
│  Tools:   read, write, edit, bash, grep, find, ls           │
│  Skills:  debugging.sk, tdd.sk, nextjs.sk (3 total)          │
│  Context: AGENTS.md, CLAUDE.md, api-conventions.md (3 files)  │
│  Hooks:   Pre: npm install  Post: (none)                      │
│  Budget:  $5.00/session active                                  │
│                                                                  │
│  Source: global + vessel(web-dev-cody) overrides                │
│                                                                  │
│  [🔍 Preview CLI command]                                      │
│                                                                  │
│                     [🚀 Launch Pi]  [Cancel]                    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 4.4 Config Preview (CLI Command Inspector)

When user clicks **Preview CLI command** in the launch dialog:

```
┌─ Resolved CLI Command ─────────────────────────────────────────┐
│                                                                   │
│  pi --mode json -p "Add an about page with Next.js..."          │
│     --provider zai                                             │
│     --model glm-5v-turbo                                       │
│     --thinking medium                                          │
│     --skill /Users/alex/.pi/skills/debugging.sk               │
│     --skill /Users/alex/.pi/skills/tdd.sk                     │
│     --skill /Users/alex/Projects/my-app/nextjs.sk              │
│     @AGENTS.md @CLAUDE.md @docs/api-conventions.md             │
│     --session-dir /Users/alex/.pi/agent/sessions-bridge        │
│                                                                   │
│  Working directory:                                             │
│  /Users/alex/Projects/my-app                                    │
│                                                                   │
│  Resolution trace:                                              │
│  ┌──────────────────────┬──────────────────┬────────────┤     │
│  │ Setting              │ Value             │ Source      │     │
│  ├──────────────────────┼──────────────────┼────────────┤     │
│  │ provider              │ zai               │ vessel      │     │
│  │ model                 │ glm-5v-turbo      │ vessel      │     │
│  │ thinking              │ medium            │ global      │     │
│  │ tools                 │ AllowAll (7)      │ global      │     │
│  │ skills (count)        │ 3                 │ mixed       │     │
│  │ context files (count)  │ 3                 │ vessel      │     │
│  │ session_dir           │ sessions-bridge  │ global      │     │
│  │ mode                  │ json              │ launch      │     │
│  └──────────────────────┴──────────────────┴────────────┘     │
│                                                                   │
│  [Copy to clipboard]  [Close]                                   │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## 5. VALIDATION SYSTEM

### 5.1 What Gets Validated

| Check | When | On Failure |
|-------|------|------------|
| Pi binary exists and is executable | On startup + config save | Show error + browse dialog |
| Pi version >= minimum required | On startup | Warn if old |
| Skill files exist | On config save + launch | Warn, remove missing ones |
| Extension files exist | On config save + launch | Warn, remove missing ones |
| Context files exist | On launch | Warn (non-fatal) |
| Vessel path still exists | On launch | Block with error |
| Vessel is still a git repo | On launch | Block with error |
| Pre-launch hook passes | Before Pi spawn | Block with hook output |
| Budget not exceeded | On launch + during session | Warn / block |
| Session dir is writable | On first launch | Create or error |

### 5.2 Validation UI Pattern

```svelte
<!-- lib/components/Settings/ValidationStatus.svelte -->
<script lang="ts">
  import type { ValidationCheck } from '$lib/types/pi';

  interface Props {
    checks: ValidationCheck[];
    running: boolean;
  }

  let { checks, running }: Props = $props();

  $: allPassed = checks.length > 0 && checks.every(c => c.passed);
  $: hasWarnings = checks.some(c => !c.passed && c.severity === 'warning');
  $: hasErrors = checks.some(c => !c.passed && c.severity === 'error');
</script>

<div class="validation-status" class:{running}>
  <div class="validation-header">
    {#if running}
    <span class="spinner" /> Checking configuration...
    {:else if allPassed}
    <span class="check-icon">✅</span> All checks passed
    {:else if hasWarnings}
    <span class="check-icon">⚠️</span> {checks.filter(c => !c.passed).length} warning(s)
    {:else if hasErrors}
    <span class="check-icon">❌</span> {checks.filter(c => !c.passed).length} error(s)
    {/if}
  </div>

  {#each checks as check (check.id)}
  <div class="check-row" class:passed={check.passed} class:error={check.severity === 'error'}>
    <span class="check-icon">{check.passed ? '✓' : check.severity === 'error' ? '✗' : '!'}</span>
    <span class="check-name">{check.name}</span>
    <span class="check-message">{check.message}</span>
  </div>
  {/each}
</div>
```

---

## 6. QUICK PROMPT TEMPLATES

Quick prompts are saved per-vessel templates that speed up common workflows:

```typescript
// Example quick prompts for a Next.js project:
const EXAMPLE_QUICK_PROMPTS: QuickPrompt[] = [
  {
    id: uuid(),
    name: 'Feature',
    prompt_template: 'Implement the following feature: {selection}\n\nFollow our existing code patterns.',
    icon: '🚀',
    sort_order: 0,
    is_default: true,
  },
  {
    id: uuid(),
    name: 'Bug Fix',
    prompt_template: 'Fix this bug: {selection}\n\nInvestigate root cause, implement fix, add regression test if possible.',
    icon: '🐛',
    sort_order: 1,
    is_default: false,
  },
  {
    id: uuid(),
    name: 'Refactor',
    prompt_template: 'Refactor {selection}\n\nImprove readability, performance, and maintainability while preserving behavior.',
    icon: '📝',
    sort_order: 2,
    is_default: false,
  },
  {
    id: uuid(),
    name: 'Test',
    prompt_template: 'Write comprehensive tests for: {selection}\n\nInclude edge cases and follow our testing conventions.',
    icon: '✅',
    sort_order: 3,
    is_default: false,
  },
  {
    id: uuid(),
    name: 'Review',
    prompt_template: 'Review this code for bugs, security issues, and improvements:\n\n{selection}',
    icon: '👁',
    sort_order: 4,
    is_default: false,
  },
];
```

**Template variables:**
- `{selection}` — Currently selected text in diff viewer or file
- `{branch}` — Current branch name
- `{files_changed}` — List of changed files (from git status)
- `{vessel}` — Vessel/project name
- `{date}` — Current date

---

## SUMMARY

| Layer | What's Defined |
|-------|----------------|
| **Config chain** | Global → Vessel → Launch overrides, with `inherit_global` toggle |
| **Data types** | `BridgeConfig`, `VesselPiConfig`, `PiLaunchConfig`, `ToolPolicy`, `QuickPrompt`, `VesselBudget` |
| **Resolver** | `resolve_config()` — pure function, 5-step merge algorithm |
| **CLI builder** | `build_pi_command()` — converts config to actual `std::process::Command` |
| **IPC commands** | 16 commands: CRUD for global+vessel config, validation, preview, quick prompts |
| **UI screens** | Helm panel (5 tabs), Vessel settings (6 sections), Launch dialog, CLI inspector |
| **Validation** | 10-check system with severity levels, run-on-save + run-on-launch |
| **Quick prompts** | Template system with variables, per-vessel storage, reorderable |
| **Hooks** | Pre-launch and post-exit bash hooks per vessel |

**All 4 Deep Dives complete. Total spec library: ~240KB of implementation-ready documentation.**

**Ready to build.** 🔨⚓
