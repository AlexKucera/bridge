/* cargo — Git operations module for Bridge

   Provides diff, status, commit, and push operations
   against vessel git repositories. Also generates
   conventional commit messages from session context.

   Public API:
   - cargo_status(repo_path) -> StatusResult
   - cargo_diff(repo_path) -> DiffResult
   - cargo_commit(repo_path, message) -> CommitResult
   - cargo_push(repo_path) -> PushResult
   - generate_commit_message(context) -> String */

use serde::{Deserialize, Serialize};
use std::path::Path;

// ── Types ──────────────────────────────────────────────

/// Change type for a file in git.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChangeType {
    Added,
    Modified,
    Deleted,
    Renamed,
}

/// Staging status of a file change.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StagingStatus {
    Staged,
    Unstaged,
}

/// A single file's status entry (from porcelain v2).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusFile {
    pub path: String,
    pub change_type: ChangeType,
    pub staging: StagingStatus,
}

/// Result of `cargo_status` — high-level repo state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusResult {
    pub is_clean: bool,
    pub has_conflicts: bool,
    pub merge_in_progress: bool,
    pub branch_name: Option<String>,
    pub files: Vec<StatusFile>,
}

/// Summary counts from a diff operation.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DiffSummary {
    pub added: usize,
    pub modified: usize,
    pub deleted: usize,
}

/// A single file's diff with snippet.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiff {
    pub path: String,
    pub change_type: ChangeType,
    pub status: StagingStatus,
    pub additions: usize,
    pub deletions: usize,
    pub snippet: String,
}

/// Result of `cargo_diff` — structured diff data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffResult {
    pub summary: DiffSummary,
    pub files: Vec<FileDiff>,
}

/// Result of `cargo_commit`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitResult {
    pub hash: String,
    pub timestamp: String,
}

/// Result of `cargo_push`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushResult {
    pub success: bool,
    pub message: String,
}

/// Context for generating conventional commit messages.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionContext {
    pub prompt: Option<String>,
    pub files_changed: Vec<String>,
    pub skill_invoked: Option<String>,
}

// ── Errors ────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum CargoError {
    #[error("git repository error: {0}")]
    Git(String),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("commit error: {0}")]
    Commit(String),

    #[error("push error: {0}")]
    Push(String),
}

// ── Commit Message Generator ───────────────────────────

/// Generate a conventional commit message from session context.
///
/// Format rules:
/// - If skill_invoked is set: `feat(/skill): summary (files)`
/// - Otherwise: `type(scope): summary from first line of response`
/// - Always appends `(Co-authored-by: pi <pi@bridge>)`
pub fn generate_commit_message(ctx: &SessionContext) -> String {
    let coauthor = "\n\n(Co-authored-by: pi <pi@bridge>)";

    // Extract summary from prompt (first sentence or first ~60 chars)
    let summary = ctx.prompt.as_deref()
        .map(|p| extract_summary(p))
        .unwrap_or_else(|| "bridge session".to_string());

    if let Some(ref skill) = ctx.skill_invoked {
        // Skill-based format: feat(/skill): summary (files)
        let files_part = files_parenthetical(&ctx.files_changed);
        format!("feat(/{}): {} {}{}", skill, summary, files_part, coauthor)
    } else {
        // Generic format: infer type from prompt content
        let commit_type = infer_commit_type(&ctx.prompt);
        let files_part = files_parenthetical(&ctx.files_changed);
        format!("{}: {} {}{}", commit_type, summary, files_part, coauthor)
    }
}

/// Extract a short summary from the prompt text.
fn extract_summary(prompt: &str) -> String {
    let trimmed = prompt.trim();

    // Take the first sentence (up to 80 chars)
    if let Some(dot_pos) = trimmed.find('.').or(trimmed.find('!').or(trimmed.find('?'))) {
        if dot_pos < 80 {
            return trimmed[..dot_pos + 1].trim().to_string();
        }
    }

    // Truncate at word boundary near 80 chars
    if trimmed.len() > 80 {
        if let Some(space_pos) = trimmed[..80].rfind(' ') {
            return trimmed[..space_pos].to_string();
        }
        return trimmed[..80].to_string();
    }

    trimmed.to_string()
}

/// Infer conventional commit type from prompt content.
fn infer_commit_type(prompt: &Option<String>) -> &'static str {
    match prompt.as_deref() {
        Some(p) if p.contains("fix") || p.contains("bug") || p.contains("error") || p.contains("crash") => "fix",
        Some(p) if p.contains("docs") || p.contains("readme") || p.contains("document") => "docs",
        Some(p) if p.contains("refactor") || p.contains("clean up") || p.contains("restructure") => "refactor",
        Some(p) if p.contains("test") || p.contains("spec") => "test",
        Some(p) if p.contains("style") || p.contains("css") || p.contains("format") => "style",
        Some(p) if p.contains("perf") || p.contains("speed") || p.contains("fast") || p.contains("slow") => "perf",
        Some(p) if p.contains("chore") || p.contains("config") || p.contains("setup") || p.contains("dependency") => "chore",
        _ => "feat",
    }
}

/// Format file list as "(file1, file2)" or empty string.
fn files_parenthetical(files: &[String]) -> String {
    if files.is_empty() {
        return String::new();
    }

    // Show max 3 files to keep message concise
    let displayed: Vec<&str> = files.iter()
        .take(3)
        .map(|f| {
            // Use just the filename, not full path
            f.rsplit('/')
                .next()
                .unwrap_or(f.as_str())
        })
        .collect();

    let suffix = if files.len() > 3 { format!(" (+{})", files.len() - 3) } else { String::new() };
    format!("({}{})", displayed.join(", "), suffix)
}

// ── cargo_commit ──────────────────────────────────────

/// Stage all changes and commit with the given message.
pub fn cargo_commit(repo_path: &Path, message: &str) -> Result<CommitResult, CargoError> {
    // Stage all changes
    git_cmd(repo_path, &["add", "-A"])?;

    // Commit with message
    let output = std::process::Command::new("git")
        .args(["-C", &repo_path.to_string_lossy()])
        .args(["commit", "-m", message])
        .output()
        .map_err(|e| CargoError::Commit(format!("git commit failed: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Check for "nothing to commit" case
        if stderr.contains("nothing to commit") {
            return Err(CargoError::Commit("nothing to commit, working tree clean".to_string()));
        }
        return Err(CargoError::Commit(format!("commit failed: {}", stderr.trim())));
    }

    // Get the commit hash
    let hash = git_cmd(repo_path, &["rev-parse", "HEAD"])
        .map(|s| s.trim().to_string())
        .map_err(|e| CargoError::Commit(format!("failed to get commit hash: {}", e)))?;

    // Get commit timestamp
    let timestamp = git_cmd(repo_path, &["log", "-1", "--format=%ci"])
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

    Ok(CommitResult { hash, timestamp })
}

// ── cargo_push ────────────────────────────────────────

/// Push commits to the default remote.
pub fn cargo_push(repo_path: &Path) -> Result<PushResult, CargoError> {
    let output = std::process::Command::new("git")
        .args(["-C", &repo_path.to_string_lossy()])
        .args(["push"])
        .output()
        .map_err(|e| CargoError::Push(format!("git push failed: {}", e)))?;

    if output.status.success() {
        Ok(PushResult {
            success: true,
            message: "Pushed successfully".to_string(),
        })
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let msg = format!("{}{}", stdout.trim(), stderr.trim());

        // Categorize common errors
        if msg.contains("non-fast-forward") || msg.contains("fetch first") {
            Err(CargoError::Push(format!("Push rejected — not up to date. Pull first. ({})", msg.trim())))
        } else if msg.contains("Authentication") || msg.contains("auth") || msg.contains("credentials") {
            Err(CargoError::Push(format!("Authentication failed. ({})", msg.trim())))
        } else if msg.contains("could not find remote") || msg.contains("No configured push destination") {
            Err(CargoError::Push(format!("No remote configured. ({})", msg.trim())))
        } else {
            Err(CargoError::Push(format!("Push failed: {}", msg.trim())))
        }
    }
}

// ── cargo_status ──────────────────────────────────────

/// Run a git command in the given repo and return its stdout.
fn git_cmd(repo_path: &Path, args: &[&str]) -> Result<String, CargoError> {
    let output = std::process::Command::new("git")
        .args(["-C", &repo_path.to_string_lossy()])
        .args(args)
        .output()
        .map_err(|e| CargoError::Git(format!("git {} failed: {}", args.join(" "), e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(CargoError::Git(format!("git {}: {}", args.join(" "), stderr.trim())));
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Get diff for an untracked file by comparing against /dev/null.
fn git_diff_untracked(repo_path: &Path, path: &str) -> String {
    let output = std::process::Command::new("git")
        .args(["-C", &repo_path.to_string_lossy()])
        .args(["diff", "--no-color", "--no-index", "/dev/null", path])
        .output();

    match output {
        Ok(o) => String::from_utf8_lossy(&o.stdout).into_owned(),
        Err(_) => String::new(),
    }
}

/// Inspect the git repository at `repo_path` and return its status.
pub fn cargo_status(repo_path: &Path) -> Result<StatusResult, CargoError> {
    let git_dir = repo_path.join(".git");
    if !git_dir.exists() {
        return Err(CargoError::Git(format!("not a git repository: {}", repo_path.display())));
    }

    // Detect merge in progress via MERGE_HEAD file
    let merge_in_progress = git_dir.join("MERGE_HEAD").exists();

    // Get current branch name
    let branch_name = git_cmd(repo_path, &["branch", "--show-current"])
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    // Get porcelain v2 status for structured parsing (-uall shows untracked files)
    let status_output = git_cmd(repo_path, &["status", "--porcelain=v2", "-uall"])?;
    let mut status_files = Vec::new();
    let mut has_conflicts = false;

    for line in status_output.lines() {
        let parsed = parse_porcelain_v2_line(line);
        match parsed {
            Some(PorcelainV2Entry::Change { path, change_type, staging }) => {
                status_files.push(StatusFile {
                    path,
                    change_type,
                    staging,
                });
            }
            Some(PorcelainV2Entry::Conflict) => {
                has_conflicts = true;
            }
            None => {}
        }
    }

    let is_clean = status_files.is_empty() && !has_conflicts;

    Ok(StatusResult {
        is_clean,
        has_conflicts,
        merge_in_progress,
        branch_name,
        files: status_files,
    })
}

// ── cargo_diff ────────────────────────────────────────

/// Get structured diff for the repository at `repo_path`.
pub fn cargo_diff(repo_path: &Path) -> Result<DiffResult, CargoError> {
    let git_dir = repo_path.join(".git");
    if !git_dir.exists() {
        return Err(CargoError::Git(format!("not a git repository: {}", repo_path.display())));
    }

    // Run both staged and unstaged diffs (numstat for stats, unified for snippets)
    let staged_numstat = git_cmd(repo_path, &["diff", "--cached", "--numstat", "--no-color"])
        .unwrap_or_default();
    let unstaged_numstat = git_cmd(repo_path, &["diff", "--numstat", "--no-color"])
        .unwrap_or_default();
    let staged_unified = git_cmd(repo_path, &["diff", "--cached", "--unified=3", "--no-color"])
        .unwrap_or_default();
    let unstaged_unified = git_cmd(repo_path, &["diff", "--unified=3", "--no-color"])
        .unwrap_or_default();

    let mut files = Vec::new();
    let mut summary = DiffSummary::default();

    // Parse staged changes (index vs HEAD)
    for line in staged_numstat.lines() {
        if let Some(file_diff) = parse_numstat_line(line, true) {
            summary = update_summary(&summary, &file_diff);
            files.push(file_diff);
        }
    }

    // Parse unstaged changes (worktree vs index) — skip files already in staged
    for line in unstaged_numstat.lines() {
        if let Some(mut file_diff) = parse_numstat_line(line, false) {
            if let Some(existing) = files.iter_mut().find(|f| f.path == file_diff.path) {
                existing.additions += file_diff.additions;
                existing.deletions += file_diff.deletions;
            } else {
                summary = update_summary(&summary, &file_diff);
                files.push(file_diff);
            }
        }
    }

    // Attach diff snippets from unified output
    attach_snippets(&mut files, &staged_unified, StagingStatus::Staged);
    attach_snippets(&mut files, &unstaged_unified, StagingStatus::Unstaged);

    // For untracked files, get them from status and generate diff snippets
    let status = cargo_status(repo_path)?;
    for sf in &status.files {
        if sf.change_type == ChangeType::Added && sf.staging == StagingStatus::Unstaged {
            let already_in_files = files.iter().any(|f| f.path == sf.path);
            if !already_in_files {
                // For untracked files, diff against /dev/null to get a proper snippet
                let snippet = git_diff_untracked(repo_path, &sf.path);
                let (additions, deletions) = count_add_del(&snippet);
                summary.added += 1;
                files.push(FileDiff {
                    path: sf.path.clone(),
                    change_type: ChangeType::Added,
                    status: StagingStatus::Unstaged,
                    additions,
                    deletions,
                    snippet,
                });
            }
        }
    }

    Ok(DiffResult { summary, files })
}

/// Parse a `git diff --numstat` line: "additions\tpath\tdeletions" or binary marker.
fn parse_numstat_line(line: &str, is_staged: bool) -> Option<FileDiff> {
    let line = line.trim();
    if line.is_empty() { return None; }

    let parts: Vec<&str> = line.split('\t').collect();
    if parts.len() < 3 { return None; }

    let additions: usize = if parts[0] == "-" { 0 } else { parts[0].parse().ok()? };
    let deletions: usize = if parts[1] == "-" { 0 } else { parts[1].parse().ok()? };
    let path = parts.last()?.to_string();

    Some(FileDiff {
        path,
        change_type: ChangeType::Modified,
        status: if is_staged { StagingStatus::Staged } else { StagingStatus::Unstaged },
        additions,
        deletions,
        snippet: String::new(),
    })
}

/// Count + and - lines in a unified diff snippet.
fn count_add_del(snippet: &str) -> (usize, usize) {
    let mut additions = 0;
    let mut deletions = 0;
    for line in snippet.lines() {
        if line.starts_with('+') && !line.starts_with("++") { additions += 1; }
        else if line.starts_with('-') && !line.starts_with("---") { deletions += 1; }
    }
    (additions, deletions)
}

/// Update summary counts based on a FileDiff.
fn update_summary(summary: &DiffSummary, fd: &FileDiff) -> DiffSummary {
    let mut s = summary.clone();
    match fd.change_type {
        ChangeType::Added => s.added += 1,
        ChangeType::Modified => s.modified += 1,
        ChangeType::Deleted => s.deleted += 1,
        ChangeType::Renamed => s.modified += 1,
    }
    s
}

/// Attach unified diff snippets to FileDiff entries by matching paths.
fn attach_snippets(files: &mut [FileDiff], unified_diff: &str, default_staging: StagingStatus) {
    // Parse unified diff into per-file chunks
    let mut current_path: Option<String> = None;
    let mut current_snippet = String::new();

    for line in unified_diff.lines() {
        if line.starts_with("diff --git") {
            // Flush previous chunk
            if let Some(ref path) = current_path {
                if let Some(fd) = files.iter_mut().find(|f| f.path == *path) {
                    if fd.snippet.is_empty() {
                        fd.snippet = std::mem::take(&mut current_snippet);
                        if fd.status == default_staging || fd.snippet.is_empty() {
                            // keep the snippet we just set
                        }
                    }
                }
            }
            // Extract path from "diff --git a/path b/path"
            current_path = line.strip_prefix("diff --git a/")
                .and_then(|rest| rest.strip_prefix(" b/"))
                .or_else(|| {
                    line.strip_prefix("diff --git a/")
                        .and_then(|rest| rest.split(" b/").nth(1))
                })
                .map(|s| s.to_string());
            current_snippet = format!("{}\n", line);
        } else if current_path.is_some() {
            current_snippet.push_str(line);
            current_snippet.push('\n');
        }
    }

    // Flush final chunk
    if let Some(ref path) = current_path {
        if let Some(fd) = files.iter_mut().find(|f| f.path == *path) {
            if fd.snippet.is_empty() {
                fd.snippet = current_snippet;
            }
        }
    }
}

/// Parsed entry from porcelain v2 output.
enum PorcelainV2Entry {
    Change { path: String, change_type: ChangeType, staging: StagingStatus },
    Conflict,
}

/// Parse a single line of `git status --porcelain=v2` output.
fn parse_porcelain_v2_line(line: &str) -> Option<PorcelainV2Entry> {
    // Format reference: https://git-scm.com/docs/git-status#_porcelain_v2_format
    //   1 .M N... file.txt          (ordinary change, unstaged)
    //   1 M. N... file.txt          (staged change)
    //   1 MM N... file.txt          (staged + unstaged)
    //   ? filename                  (untracked file)
    //   1 uU N... file.txt          (conflict: both modified)
    //   # branch main (oid HEAD)

    let line = line.trim();
    if line.is_empty() || line.starts_with('#') {
        return None;
    }

    // Handle untracked files: "? filename"
    if let Some(path) = line.strip_prefix('?') {
        return Some(PorcelainV2Entry::Change {
            path: path.trim().to_string(),
            change_type: ChangeType::Added,
            staging: StagingStatus::Unstaged,
        });
    }

    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() < 3 {
        return None;
    }

    // parts[0] is typically "1" (ordinary entry) or "2" (rename/copy)
    // parts[1] is the XY status (index + worktree status chars)

    let xy = if parts[0] == "1" && parts.len() >= 3 {
        parts[1]
    } else if parts[0] == "2" && parts.len() >= 5 {
        parts[1]
    } else {
        return None;
    };

    let x = xy.chars().next()?; // index status
    let y = if xy.len() > 1 { xy.chars().nth(1) } else { None }; // worktree status

    // Detect conflicts: 'u' in either position means unmerged
    if x == 'u' || y == Some('u') {
        return Some(PorcelainV2Entry::Conflict);
    }

    let (change_type, staging) = match (x, y) {
        ('A', _) => (ChangeType::Added, StagingStatus::Staged),       // staged add
        ('D', None) | ('D', Some('.')) => (ChangeType::Deleted, StagingStatus::Staged), // staged delete
        ('R', _) | ('C', _) => (ChangeType::Renamed, StagingStatus::Staged), // staged rename/copy
        ('M', Some('.')) => (ChangeType::Modified, StagingStatus::Staged),   // staged modify
        ('.', Some('M')) => (ChangeType::Modified, StagingStatus::Unstaged),  // unstaged modify
        ('M', Some('M')) => (ChangeType::Modified, StagingStatus::Unstaged),  // both
        ('.', Some('D')) => (ChangeType::Deleted, StagingStatus::Unstaged),   // worktree delete
        _ => return None,
    };

    // Extract path - for type 2 entries (renames), get the destination path
    let path = if parts[0] == "2" && parts.len() >= 5 {
        // Format: 2 R... score orig_path -> dest_path
        parts.iter()
            .position(|p| *p == "->")
            .and_then(|arrow_idx| parts.get(arrow_idx + 1))
            .unwrap_or(&parts[parts.len() - 1])
            .to_string()
    } else {
        parts.last()?.to_string()
    };

    Some(PorcelainV2Entry::Change { path, change_type, staging })
}



// ── Tests ─────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::process::Command;

    /// Helper: create a real temp git repo with an initial commit.
    fn init_repo() -> tempfile::TempDir {
        let dir = tempfile::TempDir::new().expect("tempdir");
        let path = dir.path();

        Command::new("git")
            .args(["init", "--initial-branch=main"])
            .current_dir(path)
            .output()
            .expect("git init");

        // Configure user for commits
        Command::new("git")
            .args(["config", "user.email", "test@bridge.dev"])
            .current_dir(path)
            .output()
            .expect("git config email");

        Command::new("git")
            .args(["config", "user.name", "Test User"])
            .current_dir(path)
            .output()
            .expect("git config name");

        // Create initial commit so we have something to diff against
        fs::write(path.join("README.md"), "# Test\n").expect("write README");
        Command::new("git")
            .args(["add", "README.md"])
            .current_dir(path)
            .output()
            .expect("git add");
        Command::new("git")
            .args(["commit", "-m", "initial"])
            .current_dir(path)
            .output()
            .expect("git commit");

        dir
    }

    // ─── Tracer Bullet: cargo_status on clean repo ───

    #[test]
    fn status_clean_repo_reports_is_clean_true() {
        let dir = init_repo();
        let result = cargo_status(dir.path()).expect("status should succeed");

        assert!(result.is_clean, "freshly committed repo should be clean");
        assert!(!result.has_conflicts);
        assert!(!result.merge_in_progress);
        assert_eq!(result.branch_name.as_deref(), Some("main"));
        assert!(result.files.is_empty());
    }

    #[test]
    fn status_dirty_repo_detects_modified_file() {
        let dir = init_repo();

        // Modify a tracked file
        fs::write(dir.path().join("README.md"), "# Test\n\nModified!\n")
            .expect("write modified");

        let result = cargo_status(dir.path()).expect("status should succeed");

        assert!(!result.is_clean, "modified repo should not be clean");
        assert_eq!(result.files.len(), 1, "should have one changed file");
        assert_eq!(result.files[0].path, "README.md");
        assert_eq!(result.files[0].change_type, ChangeType::Modified);
        assert_eq!(result.files[0].staging, StagingStatus::Unstaged);
    }

    #[test]
    fn status_new_file_detected_as_added() {
        let dir = init_repo();

        fs::write(dir.path().join("newfile.txt"), "content\n")
            .expect("write new file");

        let result = cargo_status(dir.path()).expect("status should succeed");

        assert!(!result.is_clean);
        let added: Vec<_> = result.files.iter()
            .filter(|f| f.change_type == ChangeType::Added)
            .collect();
        assert_eq!(added.len(), 1, "should detect new untracked file as Added");
        assert_eq!(added[0].path, "newfile.txt");
    }

    #[test]
    fn status_staged_file_has_staged_status() {
        let dir = init_repo();

        // Create and stage a new file
        fs::write(dir.path().join("staged.txt"), "staged content\n")
            .expect("write staged file");
        Command::new("git")
            .args(["add", "staged.txt"])
            .current_dir(dir.path())
            .output()
            .expect("git add staged");

        let result = cargo_status(dir.path()).expect("status should succeed");

        let staged: Vec<_> = result.files.iter()
            .filter(|f| f.staging == StagingStatus::Staged)
            .collect();
        assert_eq!(staged.len(), 1, "staged file should have Staged status");
        assert_eq!(staged[0].path, "staged.txt");
        assert_eq!(staged[0].change_type, ChangeType::Added);
    }

    #[test]
    fn status_deleted_file_detected_as_deleted() {
        let dir = init_repo();

        // Delete a tracked file
        fs::remove_file(dir.path().join("README.md")).expect("remove README");

        let result = cargo_status(dir.path()).expect("status should succeed");

        let deleted: Vec<_> = result.files.iter()
            .filter(|f| f.change_type == ChangeType::Deleted)
            .collect();
        assert_eq!(deleted.len(), 1, "deleted file should be detected");
        assert_eq!(deleted[0].path, "README.md");
    }

    #[test]
    fn status_merge_in_progress_detected_via_merge_head() {
        let dir = init_repo();

        // Simulate merge conflict by creating MERGE_HEAD
        fs::write(dir.path().join(".git").join("MERGE_HEAD"), "abc1234\n")
            .expect("create MERGE_HEAD");

        let result = cargo_status(dir.path()).expect("status should succeed");

        assert!(result.merge_in_progress, "should detect MERGE_HEAD file");
    }

    #[test]
    fn status_non_git_repo_returns_error() {
        let dir = tempfile::TempDir::new().expect("tempdir");
        let result = cargo_status(dir.path());

        assert!(result.is_err(), "non-git directory should return error");
    }

    // ─── cargo_diff tests ──────────────────────────────

    #[test]
    fn diff_modified_file_returns_correct_stats_and_snippet() {
        let dir = init_repo();

        // Modify README.md
        fs::write(dir.path().join("README.md"), "# Test\n\nNew line here\n")
            .expect("write modified");

        let result = cargo_diff(dir.path()).expect("diff should succeed");

        assert_eq!(result.summary.modified, 1, "should have 1 modified file");
        assert_eq!(result.summary.added, 0, "no added files");
        assert_eq!(result.summary.deleted, 0, "no deleted files");
        assert_eq!(result.files.len(), 1);
        assert_eq!(result.files[0].path, "README.md");
        assert_eq!(result.files[0].change_type, ChangeType::Modified);
        assert!(result.files[0].additions > 0 || result.files[0].deletions > 0,
            "should have some additions or deletions");
        assert!(!result.files[0].snippet.is_empty(), "snippet should not be empty");
        // Snippet should contain diff markers
        assert!(result.files[0].snippet.contains('+') || result.files[0].snippet.contains('-'),
            "snippet should contain + or - lines");
    }

    #[test]
    fn diff_new_file_shows_as_added_with_snippet() {
        let dir = init_repo();

        fs::write(dir.path().join("brandnew.rs"), "fn main() {}\n")
            .expect("write new file");

        let result = cargo_diff(dir.path()).expect("diff should succeed");

        let added: Vec<_> = result.files.iter()
            .filter(|f| f.change_type == ChangeType::Added)
            .collect();
        assert_eq!(added.len(), 1, "should detect new untracked file");
        assert_eq!(added[0].path, "brandnew.rs");
        assert!(!added[0].snippet.is_empty(), "added file snippet should not be empty");
    }

    #[test]
    fn diff_clean_repo_has_empty_files() {
        let dir = init_repo();

        let result = cargo_diff(dir.path()).expect("diff should succeed");

        assert!(result.files.is_empty(), "clean repo should have no diffs");
        assert_eq!(result.summary.added, 0);
        assert_eq!(result.summary.modified, 0);
        assert_eq!(result.summary.deleted, 0);
    }

    #[test]
    fn diff_multiple_changes_populates_summary_counts() {
        let dir = init_repo();

        // Modify existing file
        fs::write(dir.path().join("README.md"), "# Test\nmodified\n").expect("write");
        // Add new file
        fs::write(dir.path().join("extra.txt"), "extra\n").expect("write extra");
        // Delete tracked file (via git rm)
        Command::new("git")
            .args(["rm", "--cached", "README.md"])
            .current_dir(dir.path())
            .output().expect("git rm cached");

        let result = cargo_diff(dir.path()).expect("diff should succeed");

        // Should have at least 2 entries (deleted README + new extra.txt)
        assert!(result.files.len() >= 2, "expected at least 2 changed files, got {}", result.files.len());

        // Summary counts should match
        let total: usize = result.summary.added + result.summary.modified + result.summary.deleted;
        assert_eq!(total, result.files.len(),
            "summary counts ({}) should match total files ({})", total, result.files.len());
    }

    // ─── generate_commit_message tests ──────────────────

    #[test]
    fn commit_msg_skill_based_has_type_scope_format() {
        let ctx = SessionContext {
            prompt: Some("implement user auth".to_string()),
            files_changed: vec!["src/auth.rs".to_string()],
            skill_invoked: Some("tdd".to_string()),
        };

        let msg = generate_commit_message(&ctx);

        // Should start with "feat(/tdd):"
        assert!(msg.starts_with("feat(/tdd):"),
            "skill-based msg should start with 'feat(/tdd):', got: {}", msg);
        // Should contain feature from prompt
        assert!(msg.contains("auth"), "should reference prompt content");
    }

    #[test]
    fn commit_msg_generic_has_conventional_format() {
        let ctx = SessionContext {
            prompt: Some("fix the login bug".to_string()),
            files_changed: vec!["src/login.rs".to_string()],
            skill_invoked: None,
        };

        let msg = generate_commit_message(&ctx);

        // Should have type(scope): summary format
        let has_type_scope = msg.contains(":") && (msg.starts_with("feat") || msg.starts_with("fix")
            || msg.starts_with("docs") || msg.starts_with("refactor")
            || msg.starts_with("chore") || msg.starts_with("style")
            || msg.starts_with("perf") || msg.starts_with("test")
            || msg.starts_with("build") || msg.starts_with("ci"));
        assert!(has_type_scope,
            "generic msg should have conventional format, got: {}", msg);
    }

    #[test]
    fn commit_msg_includes_coauthor() {
        let ctx = SessionContext {
            prompt: Some("add footer component".to_string()),
            files_changed: vec!["src/Footer.tsx".to_string()],
            skill_invoked: None,
        };

        let msg = generate_commit_message(&ctx);

        assert!(msg.contains("Co-authored-by: pi <pi@bridge>"),
            "should include co-author attribution, got: {}", msg);
    }

    #[test]
    fn commit_msg_includes_files_affected() {
        let ctx = SessionContext {
            prompt: Some("update styles".to_string()),
            files_changed: vec!["src/App.css".to_string(), "src/theme.css".to_string()],
            skill_invoked: None,
        };

        let msg = generate_commit_message(&ctx);

        // Files should appear in parentheses somewhere
        assert!(msg.contains("App.css") || msg.contains("theme.css"),
            "should mention affected files, got: {}", msg);
    }

    #[test]
    fn commit_msg_empty_context_falls_back_gracefully() {
        let ctx = SessionContext {
            prompt: None,
            files_changed: vec![],
            skill_invoked: None,
        };

        let msg = generate_commit_message(&ctx);

        // Should still produce valid message with co-author
        assert!(!msg.is_empty(), "should not be empty");
        assert!(msg.contains("Co-authored-by:"), "should have co-author even for empty context");
    }

    // ─── cargo_commit tests ─────────────────────────────

    #[test]
    fn commit_stages_all_and_creates_commit() {
        let dir = init_repo();

        // Make changes: modify + add new file
        fs::write(dir.path().join("README.md"), "# Test\nmodified\n").expect("write");
        fs::write(dir.path().join("newfile.rs"), "// new\n").expect("write");

        let result = cargo_commit(dir.path(), "test commit message").expect("commit should succeed");

        // Should return a valid hash (40 hex chars for SHA-1)
        assert_eq!(result.hash.len(), 40, "commit hash should be 40 chars, got {}", result.hash.len());
        assert!(!result.timestamp.is_empty(), "timestamp should not be empty");

        // Repo should now be clean
        let status = cargo_status(dir.path()).expect("status after commit");
        assert!(status.is_clean, "repo should be clean after commit");
    }

    #[test]
    fn commit_returns_correct_hash_for_multiple_commits() {
        let dir = init_repo();

        // First commit
        fs::write(dir.path().join("file1.txt"), "content1\n").expect("write");
        let r1 = cargo_commit(dir.path(), "first").expect("commit 1");

        // Second commit
        fs::write(dir.path().join("file2.txt"), "content2\n").expect("write");
        let r2 = cargo_commit(dir.path(), "second").expect("commit 2");

        // Hashes should differ
        assert_ne!(r1.hash, r2.hash, "different commits should have different hashes");
    }

    #[test]
    fn commit_fails_on_clean_repo() {
        let dir = init_repo();

        // Nothing to commit — git returns error
        let result = cargo_commit(dir.path(), "nothing to commit");

        // Should return an error (nothing to commit)
        assert!(result.is_err(), "commit on clean repo should fail");
    }

    // ─── cargo_push tests ────────────────────────────────

    #[test]
    fn push_without_remote_returns_error() {
        let dir = init_repo();

        // Make a commit so there's something to push
        fs::write(dir.path().join("pushme.txt"), "push this\n").expect("write");
        cargo_commit(dir.path(), "prepare push").expect("commit");

        let result = cargo_push(dir.path());

        // No remote configured → error
        assert!(result.is_err(), "push without remote should return error");
    }
}
