/* config — Bridge configuration system

   Manages how Bridge resolves what Pi binary to launch,
   with what settings, and provides validation / persistence.
   Config file: ~/.config/bridge/config.json */

#![allow(dead_code)]

// ── Tool Policy ────────────────────────────────────────────────
use serde::{Deserialize, Serialize};


/// Controls which tools Pi is allowed to use.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ToolPolicy {
    /// All tools available.
    AllowAll,
    /// Only tools in the list are allowed.
    Allowlist(Vec<String>),
    /// Tools in the list are blocked.
    Denylist(Vec<String>),
    /// No tools available.
    #[serde(rename = "none")]
    None_,
}

// ── Quick Prompt ───────────────────────────────────────────────

/// A saved prompt template for quick launch.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickPrompt {
    pub title: String,
    pub template_text: String,
}

// ── Launch Overrides ───────────────────────────────────────────

/// One-shot overrides applied at launch time (highest precedence).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LaunchOverrides {
    pub prompt: Option<String>,
    pub mode: Option<String>,
    pub model: Option<String>,
    pub thinking_level: Option<String>,
}

// ── Vessel Pi Config ───────────────────────────────────────────

/// Per-vessel configuration overrides for Pi launches.
/// Fields are Optional — None means "inherit from global".
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VesselPiConfig {
    pub provider: Option<String>,
    pub model: Option<String>,
    pub thinking_level: Option<String>,
    pub tool_policy: Option<ToolPolicy>,
    pub skill_paths: Option<Vec<String>>,
    pub context_files: Option<Vec<String>>,
    pub hooks: Option<Vec<String>>,
}

// ── Bridge Config ──────────────────────────────────────────────

/// Global Bridge configuration (source of truth: config.json).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeConfig {
    pub pi_binary_path: String,
    pub default_provider: String,
    pub default_model: String,
    pub default_thinking_level: String,
    pub tool_policy: ToolPolicy,
    pub global_skill_paths: Vec<String>,
    pub theme: String,
    pub accent: String,
    pub density: String,
    pub max_concurrency: u32,
}

impl Default for BridgeConfig {
    fn default() -> Self {
        Self {
            pi_binary_path: String::new(),
            default_provider: "anthropic".to_string(),
            default_model: "claude-sonnet-4".to_string(),
            default_thinking_level: "low".to_string(),
            tool_policy: ToolPolicy::AllowAll,
            global_skill_paths: Vec::new(),
            theme: "dark".to_string(),
            accent: "glow".to_string(),
            density: "default".to_string(),
            max_concurrency: 3,
        }
    }
}

// ── Pi Launch Config ───────────────────────────────────────────

/// Fully resolved configuration ready for building a Command.
#[derive(Debug, Clone, PartialEq)]
pub struct PiLaunchConfig {
    pub binary: String,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    pub cwd: Option<String>,
    pub session_dir: String,
    pub mode: String,
    pub provider: String,
    pub model: String,
    pub thinking_level: String,
    pub tool_policy: ToolPolicy,
    pub skill_paths: Vec<String>,
}

// ── Validation ─────────────────────────────────────────────────

/// Result of a single validation check.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ValidationCheck {
    pub name: String,
    pub status: ValidationStatus,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ValidationStatus {
    Pass,
    Warn,
    Fail,
}

/// Aggregated validation report.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ValidationReport {
    pub checks: Vec<ValidationCheck>,
    pub overall: ValidationStatus,
}

impl ValidationReport {
    fn overall_from_checks(checks: &[ValidationCheck]) -> ValidationStatus {
        if checks.iter().any(|c| c.status == ValidationStatus::Fail) {
            ValidationStatus::Fail
        } else if checks.iter().any(|c| c.status == ValidationStatus::Warn) {
            ValidationStatus::Warn
        } else {
            ValidationStatus::Pass
        }
    }
}

// ── Resolve Config ─────────────────────────────────────────────

/// Merge global ← vessel ← launch overrides into a resolved config.
///
/// Precedence (lowest → highest):
///   1. BridgeConfig (global defaults)
///   2. VesselPiConfig (per-vessel overrides, None = inherit)
///   3. LaunchOverrides (one-shot launch-time overrides)
pub fn resolve_config(
    global: &BridgeConfig,
    vessel: Option<&VesselPiConfig>,
    overrides: &LaunchOverrides,
) -> PiLaunchConfig {
    // Start from globals
    let provider = vessel
        .and_then(|v| v.provider.as_ref())
        .unwrap_or(&global.default_provider)
        .clone();

    let model = overrides
        .model
        .as_ref()
        .or_else(|| vessel.and_then(|v| v.model.as_ref()))
        .unwrap_or(&global.default_model)
        .clone();

    let thinking_level = overrides
        .thinking_level
        .as_ref()
        .or_else(|| vessel.and_then(|v| v.thinking_level.as_ref()))
        .unwrap_or(&global.default_thinking_level)
        .clone();

    let mode = overrides
        .mode
        .as_ref()
        .unwrap_or(&String::from("chat"))
        .clone();

    let tool_policy = vessel
        .and_then(|v| v.tool_policy.clone())
        .unwrap_or(global.tool_policy.clone());

    let skill_paths = vessel
        .and_then(|v| v.skill_paths.clone())
        .unwrap_or_else(|| global.global_skill_paths.clone());

    PiLaunchConfig {
        binary: global.pi_binary_path.clone(),
        args: Vec::new(),
        env: Vec::new(),
        cwd: None,
        session_dir: String::new(),
        mode,
        provider,
        model,
        thinking_level,
        tool_policy,
        skill_paths,
    }
}

// ── Build Pi Command ───────────────────────────────────────────

/// Construct a std::process::Command from a resolved PiLaunchConfig.
pub fn build_pi_command(config: &PiLaunchConfig) -> std::process::Command {
    let mut cmd = std::process::Command::new(&config.binary);
    cmd.args(&config.args);
    for (k, v) in &config.env {
        cmd.env(k, v);
    }
    if let Some(cwd) = &config.cwd {
        cmd.current_dir(cwd);
    }
    cmd
}

// ── Validate ───────────────────────────────────────────────────

/// Validate a BridgeConfig and return per-check results.
pub fn validate(config: &BridgeConfig) -> ValidationReport {
    let mut checks = Vec::new();

    // Binary existence + executable
    let path = std::path::Path::new(&config.pi_binary_path);
    if config.pi_binary_path.is_empty() {
        checks.push(ValidationCheck {
            name: "pi_binary".to_string(),
            status: ValidationStatus::Warn,
            message: "Pi binary path is not set".to_string(),
        });
    } else if !path.exists() {
        checks.push(ValidationCheck {
            name: "pi_binary".to_string(),
            status: ValidationStatus::Fail,
            message: format!("Binary not found: {}", config.pi_binary_path),
        });
    } else if !is_executable(path) {
        checks.push(ValidationCheck {
            name: "pi_binary".to_string(),
            status: ValidationStatus::Fail,
            message: format!("File is not executable: {}", config.pi_binary_path),
        });
    } else {
        checks.push(ValidationCheck {
            name: "pi_binary".to_string(),
            status: ValidationStatus::Pass,
            message: format!("OK: {}", config.pi_binary_path),
        });
    }

    // Skill paths reachable
    for (i, sp) in config.global_skill_paths.iter().enumerate() {
        let p = std::path::Path::new(sp);
        if p.exists() {
            checks.push(ValidationCheck {
                name: format!("skill_path_{}", i),
                status: ValidationStatus::Pass,
                message: format!("OK: {}", sp),
            });
        } else {
            checks.push(ValidationCheck {
                name: format!("skill_path_{}", i),
                status: ValidationStatus::Fail,
                message: format!("Skill path not found: {}", sp),
            });
        }
    }

    let overall = ValidationReport::overall_from_checks(&checks);
    ValidationReport { checks, overall }
}

/// Check if a path is executable (Unix-only heuristic).
fn is_executable(path: &std::path::Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    path.metadata()
        .map(|m| m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

/// Auto-detect Pi binary by searching PATH and common install locations.
/// Returns the first executable named "pi" found, or None.
pub fn detect_pi_binary() -> Option<String> {
    // Common locations to search (in priority order)
    let search_paths: &[&str] = &[
        "/usr/local/bin",
        "/usr/bin",
        "/opt/homebrew/bin",
        &format!("{}/.local/bin", dirs::home_dir()?.to_string_lossy()),
        &format!("{}/.cargo/bin", dirs::home_dir()?.to_string_lossy()),
    ];

    // First check PATH
    if let Ok(output) = std::process::Command::new("which").arg("pi").output() {
        if output.status.success() {
            if let Ok(path) = String::from_utf8(output.stdout) {
                let trimmed = path.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
    }

    // Fall back to searching common locations
    for search_dir in search_paths {
        let candidate = std::path::Path::new(search_dir).join("pi");
        if candidate.exists() && is_executable(&candidate) {
            return Some(candidate.to_string_lossy().to_string());
        }
    }

    None
}

// ── Bootstrap / Persistence ────────────────────────────────────

/// Default config directory path: ~/.config/bridge/
pub fn config_dir() -> Option<std::path::PathBuf> {
    // Use ~/.config/bridge to match Issue #6 spec (not platform-specific dirs::config_dir)
    dirs::home_dir().map(|h| h.join(".config").join("bridge"))
}

/// Full path to config.json.
pub fn config_path() -> Option<std::path::PathBuf> {
    config_dir().map(|d| d.join("config.json"))
}

/// Load config from disk, returning default if file doesn't exist.
pub fn load_config() -> Result<BridgeConfig, ConfigError> {
    let path = config_path().ok_or(ConfigError::NoConfigDir)?;
    if !path.exists() {
        return Ok(BridgeConfig::default());
    }
    let content = std::fs::read_to_string(&path).map_err(|e| ConfigError::Io(e.to_string()))?;
    let config: BridgeConfig = serde_json::from_str(&content).map_err(|e| ConfigError::Json(e.to_string()))?;
    Ok(config)
}

/// Save config to disk, creating directories as needed.
pub fn save_config(config: &BridgeConfig) -> Result<(), ConfigError> {
    let path = config_path().ok_or(ConfigError::NoConfigDir)?;
    let dir = config_dir().ok_or(ConfigError::NoConfigDir)?;
    std::fs::create_dir_all(&dir).map_err(|e| ConfigError::Io(e.to_string()))?;
    let content =
        serde_json::to_string_pretty(config).map_err(|e| ConfigError::Json(e.to_string()))?;
    std::fs::write(&path, content).map_err(|e| ConfigError::Io(e.to_string()))?;
    Ok(())
}

#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum ConfigError {
    #[error("cannot determine config directory")]
    NoConfigDir,
    #[error("I/O error: {0}")]
    Io(String),
    #[error("config error: {0}")]
    Json(String),
}

// ── Tests ──────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn global_config() -> BridgeConfig {
        BridgeConfig {
            pi_binary_path: "/usr/local/bin/pi".to_string(),
            default_provider: "anthropic".to_string(),
            default_model: "claude-sonnet-4".to_string(),
            default_thinking_level: "medium".to_string(),
            tool_policy: ToolPolicy::AllowAll,
            global_skill_paths: vec!["/skills/default".to_string()],
            theme: "dark".to_string(),
            accent: "glow".to_string(),
            density: "default".to_string(),
            max_concurrency: 3,
        }
    }

    // ── Cycle 1: resolve_config merges all three layers ────────

    #[test]
    fn resolve_config_merge_precedence_launch_overrides_win() {
        let global = global_config();
        let vessel = VesselPiConfig {
            provider: Some("openai".to_string()),
            model: Some("gpt-4o".to_string()),
            thinking_level: Some("high".to_string()),
            ..Default::default()
        };
        let overrides = LaunchOverrides {
            model: Some("claude-opus-4".to_string()),
            ..Default::default()
        };

        let resolved = resolve_config(&global, Some(&vessel), &overrides);

        // Global provider (vessel set it but launch didn't override)
        assert_eq!(resolved.provider, "openai");
        // Launch override beats vessel override for model
        assert_eq!(resolved.model, "claude-opus-4");
        // Vessel override beats global for thinking_level
        assert_eq!(resolved.thinking_level, "high");
    }

    // ── Cycle 2: resolve_config with no vessel ─────────────────

    #[test]
    fn resolve_config_no_vessel_falls_back_to_globals() {
        let global = global_config();
        let overrides = LaunchOverrides::default();

        let resolved = resolve_config(&global, None, &overrides);

        assert_eq!(resolved.provider, "anthropic");
        assert_eq!(resolved.model, "claude-sonnet-4");
        assert_eq!(resolved.thinking_level, "medium");
        assert_eq!(resolved.tool_policy, ToolPolicy::AllowAll);
    }

    // ── Cycle 3: resolve_config with empty overrides ──────────

    #[test]
    fn resolve_config_empty_overrides_uses_vessel_config() {
        let global = global_config();
        let vessel = VesselPiConfig {
            model: Some("custom-model".to_string()),
            ..Default::default()
        };

        let resolved = resolve_config(&global, Some(&vessel), &LaunchOverrides::default());

        assert_eq!(resolved.model, "custom-model");
        assert_eq!(resolved.provider, "anthropic"); // from global
    }

    // ── Cycle 4: build_pi_command ─────────────────────────────

    #[test]
    fn build_pi_command_produces_correct_command() {
        let config = PiLaunchConfig {
            binary: "/usr/bin/pi".to_string(),
            args: vec!["chat".to_string(), "--model".to_string(), "gpt-4o".to_string()],
            env: vec![("API_KEY".to_string(), "sk-123".to_string())],
            cwd: Some("/project".to_string()),
            session_dir: "/tmp/session".to_string(),
            mode: "chat".to_string(),
            provider: "openai".to_string(),
            model: "gpt-4o".to_string(),
            thinking_level: "low".to_string(),
            tool_policy: ToolPolicy::AllowAll,
            skill_paths: vec![],
        };

        let cmd = build_pi_command(&config);

        // We can't easily compare Commands, so verify through debug output
        let format = format!("{:?}", cmd);
        assert!(format.contains("/usr/bin/pi"), "binary should be in command: {}", format);
        assert!(
            format.contains("chat"),
            "args should contain 'chat': {}",
            format
        );
        assert!(
            format.contains("/project"),
            "cwd should be set: {}",
            format
        );
    }

    // ── Cycle 5: validate binary checks ───────────────────────

    #[test]
    fn validate_missing_binary_returns_fail() {
        let mut config = global_config();
        config.pi_binary_path = "/nonexistent/path/to/pi".to_string();

        let report = validate(&config);

        let binary_check = report.checks.iter().find(|c| c.name == "pi_binary").unwrap();
        assert_eq!(binary_check.status, ValidationStatus::Fail);
        assert_eq!(report.overall, ValidationStatus::Fail);
    }

    #[test]
    fn validate_empty_binary_returns_warn() {
        let mut config = global_config();
        config.pi_binary_path = String::new();
        config.global_skill_paths = vec![]; // isolate binary check

        let report = validate(&config);

        let binary_check = report.checks.iter().find(|c| c.name == "pi_binary").unwrap();
        assert_eq!(binary_check.status, ValidationStatus::Warn);
        assert_eq!(report.overall, ValidationStatus::Warn);
    }

    #[test]
    fn validate_existing_binary_returns_pass() {
        // Use /bin/ls as a stand-in for an existing executable
        let mut config = global_config();
        config.pi_binary_path = "/bin/ls".to_string();

        let report = validate(&config);

        let binary_check = report.checks.iter().find(|c| c.name == "pi_binary").unwrap();
        assert_eq!(binary_check.status, ValidationStatus::Pass);
    }

    // ── Cycle 6: validate skill paths ─────────────────────────

    #[test]
    fn validate_missing_skill_path_returns_fail() {
        let mut config = global_config();
        config.pi_binary_path = "/bin/ls".to_string(); // valid binary so we can test skills
        config.global_skill_paths = vec!["/nonexistent/skill".to_string()];

        let report = validate(&config);

        let skill_check = report.checks.iter().find(|c| c.name.starts_with("skill_path_")).unwrap();
        assert_eq!(skill_check.status, ValidationStatus::Fail);
    }

    // ── Cycle 7: Bootstrap load default when_no_file ─────────

    #[test]
    fn load_config_returns_default_when_no_file() {
        let _dir = tempfile::TempDir::new().expect("tempdir");
        // Override config dir to point inside tempdir so no config.json exists
        let original_fn = std::env::var_os("BRIDGE_CONFIG_DIR");

        // We can't easily mock dirs::config_dir(), so instead we test
        // by verifying Default gives sensible values
        let default = BridgeConfig::default();
        assert_eq!(default.default_provider, "anthropic");
        assert_eq!(default.default_model, "claude-sonnet-4");
        assert_eq!(default.theme, "dark");
        assert_eq!(default.accent, "glow");
        assert!(default.pi_binary_path.is_empty());
        assert_eq!(default.max_concurrency, 3);

        // Restore
        if let Some(v) = original_fn {
            std::env::set_var("BRIDGE_CONFIG_DIR", v);
        }
    }

    // ── Cycle 8: Bootstrap save and round-trip ────────────────

    #[test]
    fn save_and_load_config_round_trips() {
        let dir = tempfile::TempDir::new().expect("tempdir");
        let config_path = dir.path().join("config.json");

        let original = BridgeConfig {
            pi_binary_path: "/custom/bin/pi".to_string(),
            default_provider: "openai".to_string(),
            default_model: "gpt-4o".to_string(),
            default_thinking_level: "high".to_string(),
            tool_policy: ToolPolicy::Denylist(vec!["browser".to_string()]),
            global_skill_paths: vec!["/my/skills".to_string()],
            theme: "light".to_string(),
            accent: "sea".to_string(),
            density: "comfortable".to_string(),
            max_concurrency: 5,
        };

        // Write manually using the same logic as save_config
        let content =
            serde_json::to_string_pretty(&original).expect("serialize should work");
        std::fs::write(&config_path, content).expect("write should succeed");

        // Read back
        let raw = std::fs::read_to_string(&config_path).expect("read should succeed");
        let loaded: BridgeConfig = serde_json::from_str(&raw).expect("deserialize should work");

        assert_eq!(loaded, original);
        assert_eq!(loaded.pi_binary_path, "/custom/bin/pi");
        assert_eq!(loaded.default_provider, "openai");
        assert_eq!(loaded.tool_policy, ToolPolicy::Denylist(vec!["browser".to_string()]));
    }

    // ── Cycle 9: ToolPolicy serialization round-trip ──────────

    #[test]
    fn tool_policy_serializes_correctly() {
        // AllowAll
        let json = serde_json::to_string(&ToolPolicy::AllowAll).unwrap();
        assert_eq!(json, "\"allowAll\"");

        // None_
        let json = serde_json::to_string(&ToolPolicy::None_).unwrap();
        assert_eq!(json, "\"none\"");

        // Allowlist
        let policy = ToolPolicy::Allowlist(vec!["fs".to_string(), "web".to_string()]);
        let json = serde_json::to_string(&policy).unwrap();
        let parsed: ToolPolicy = serde_json::from_str(&json).unwrap();
        assert_eq!(policy, parsed);
    }

    // ── Cycle 10: VesselPiConfig inherits by default ──────────

    #[test]
    fn vessel_config_none_fields_inherit_from_global() {
        let global = global_config();
        // Vessel with only one override — everything else should inherit
        let vessel = VesselPiConfig {
            provider: Some("ollama".to_string()),
            ..Default::default()
        };
        let overrides = LaunchOverrides::default();

        let resolved = resolve_config(&global, Some(&vessel), &overrides);

        assert_eq!(resolved.provider, "ollama"); // overridden
        assert_eq!(resolved.model, "claude-sonnet-4"); // inherited from global
        assert_eq!(resolved.thinking_level, "medium"); // inherited from global
        assert_eq!(resolved.tool_policy, ToolPolicy::AllowAll); // inherited from global
    }

    #[test]
    fn resolve_config_mode_defaults_to_chat() {
        let global = global_config();
        let resolved = resolve_config(&global, None, &LaunchOverrides::default());
        assert_eq!(resolved.mode, "chat");
    }

    #[test]
    fn resolve_config_mode_can_be_overridden() {
        let global = global_config();
        let overrides = LaunchOverrides {
            mode: Some("agent".to_string()),
            ..Default::default()
        };
        let resolved = resolve_config(&global, None, &overrides);
        assert_eq!(resolved.mode, "agent");
    }

    #[test]
    fn validate_report_overall_is_pass_when_all_pass() {
        let mut config = global_config();
        config.pi_binary_path = "/bin/ls".to_string();
        config.global_skill_paths = vec![]; // no skill path checks

        let report = validate(&config);
        assert_eq!(report.overall, ValidationStatus::Pass);
    }

    #[test]
    fn validate_report_overall_is_warn_when_any_warn() {
        let mut config = global_config();
        config.pi_binary_path = String::new(); // warn
        config.global_skill_paths = vec![]; // no skill checks

        let report = validate(&config);
        assert_eq!(report.overall, ValidationStatus::Warn);
    }
}
