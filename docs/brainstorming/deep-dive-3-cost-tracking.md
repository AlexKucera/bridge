# Deep Dive 3: Cost Tracking System

> **Bridge × Pi Integration — Real-time and historical cost analytics**
> **Status:** Implementation-ready spec + UX interaction design
> **Data source:** Pi's `usage` + `cost` fields in every assistant message_end event

---

## 1. THE VALUE PROP

Pi returns **token usage and cost in every single response**. This data is free — it's already there. Bridge turns it into:

- **Real-time cost meter** — See money burning as Pi works (per session)
- **Per-vessel budgets** — Set limits, get warnings, auto-stop at threshold
- **Fleet-wide dashboard** — Daily/weekly/monthly trends across all projects
- **Provider comparison** — Is glm-5v cheaper than sonnet for your workload?
- **Tool-level costing** — How much did that `bash npm test` cycle cost?
- **Forecasting** — At current rate, what will this month look like?

---

## 2. DATA MODEL

### 2.1 Core Types

```rust
use serde::{Deserialize, Serialize};

/// Accumulated cost data for a single completed session.
/// Written to SQLite on session end. Read for dashboards.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionCostRecord {
    pub id: Uuid,                          // Primary key
    pub pi_session_id: String,
    pub vessel_id: Option<Uuid>,
    pub session_file: PathBuf,

    // Temporal
    pub started_at: DateTime<Utc>,
    pub ended_at: DateTime<Utc>,
    pub duration_secs: f64,

    // Totals
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_cache_read: u64,
    pub total_cache_write: u64,
    pub total_tokens: u64,
    pub total_cost_usd: f64,

    // Breakdowns (JSON columns for flexibility)
    pub provider_costs: Json<ProviderBreakdown>,   // {"zai": 0.05, "anthropic": 0.02}
    pub model_costs: Json<ModelBreakdown>,         // {"glm-5v-turbo": 0.05, "sonnet": 02}

    // Activity metrics
    pub turn_count: u32,
    pub tool_call_count: u32,
    pub tool_breakdown: Json<HashMap<String, u32>>, // {"read": 10, "edit": 5}

    // Files touched
    pub files_touched: Json<Vec<String>>,

    // Model info
    pub primary_model: Option<String>,
    pub primary_provider: Option<String>,

    // Error flag
    pub had_error: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProviderBreakdown(pub HashMap<String, f64>); // provider_name → cost

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ModelBreakdown(pub HashMap<String, f64>);  // model_id → cost

/// Live cost accumulator — updated in-memory as events stream in.
/// Persisted to SessionCostRecord on session end.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LiveCostAccumulator {
    // Current session running totals (updated per message_end)
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
    pub total_cost_usd: f64,

    // Per-turn breakdown (for the "cost per turn" display)
    pub turn_costs: Vec<TurnCostRecord>,

    // Per-tool cost attribution (approximate: tools are within turns)
    pub tool_cost_estimate: HashMap<String, f64>,  // tool_name → approximate cost

    // Start time (for rate calculation)
    pub session_started_at: DateTime<Utc>,

    // Rate tracking
    pub tokens_per_second: f64,                   // Rolling average
    pub cost_per_second: f64,                     // Rolling average

    // Budget checking
    pub budget_warning_emitted: bool,
    pub budget_stop_emitted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TurnCostRecord {
    pub turn_index: u32,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read: u64,
    pub total_tokens: u64,
    pub cost_usd: f64,
    pub tool_count: u32,
    pub duration_ms: u64,
    pub timestamp: DateTime<Utc>,
}
```

### 2.2 Budget System

```rust
/// Per-vessel budget configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VesselBudget {
    pub enabled: bool,
    pub max_daily_usd: Option<f64>,           // e.g., $5.00/day
    pub max_session_usd: Option<f64>,         // e.g., $2.00/session
    pub max_monthly_usd: Option<f64>,          // e.g., $100/month
    pub warning_threshold: f64,               // Warn at X% of limit (default: 0.80)
    pub stop_at_limit: bool,                  // Auto-stop Pi when hit? (default: false)
    pub reset_day_of_month: Option<u32>,      // For monthly (default: 1st)
}

impl Default for VesselBudget {
    fn default() -> Self {
        VesselBudget {
            enabled: false,
            max_daily_usd: None,
            max_session_usd: None,
            max_monthly_usd: None,
            warning_threshold: 0.80,
            stop_at_limit: false,
            reset_day_of_month: Some(1),
        }
    }
}

/// Budget check result — returned after each message_end event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BudgetStatus {
    Ok,                                       // Well within budget
    ApproachingWarning {                      // Past warning threshold
        limit_type: BudgetLimitType,
        current: f64,
        limit: f64,
        percent: f64,
    },
    LimitExceeded {                           // Over the limit!
        limit_type: BudgetLimitType,
        current: f64,
        limit: f64,
        percent: f64,
        action_required: BudgetAction,       // What should happen
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum BudgetLimitType { Daily, Session, Monthly }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum BudgetAction {
    WarnOnly,                                 // Show toast, continue working
    StopSession,                              // Auto-stop Pi after current turn
    BlockLaunch,                              // Don't allow new sessions
}
```

### 2.3 Dashboard Aggregation Types

```rust
/// Pre-computed dashboard data (expensive query, cached).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostDashboard {
    // Time range this dashboard covers
    pub period_start: DateTime<Utc>,
    pub period_end: DateTime<Utc>,
    pub period_type: MetricPeriod,

    // Fleet totals
    pub fleet_total_cost: f64,
    pub fleet_total_tokens: u64,
    pub fleet_total_sessions: u32,
    pub fleet_total_turns: u32,
    pub fleet_avg_cost_per_session: f64,
    pub fleet_avg_cost_per_turn: f64,

    // Per-vessel breakdown
    pub vessel_breakdown: Vec<VesselCostRow>,

    // Provider breakdown
    pub provider_breakdown: Vec<ProviderCostRow>,

    // Model breakdown
    pub model_breakdown: Vec<ModelCostRow>,

    // Tool breakdown (fleet-wide)
    pub tool_breakdown: Vec<ToolCostRow>,

    // Daily time series (for sparkline charts)
    pub daily_series: Vec<DailyCostPoint>,

    // Hourly distribution (heatmap data: day-of-week × hour)
    pub hourly_heatmap: Vec<HourlyHeatmapPoint>,

    // Trend vs previous period
    pub period_over_period_change: PeriodChange,

    // Top expensive sessions
    pub top_expensive_sessions: Vec<SessionCostSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VesselCostRow {
    pub vessel_id: Uuid,
    pub vessel_name: String,
    pub sessions: u32,
    pub tokens: u64,
    pub cost: f64,
    pub pct_of_fleet: f64,                    // % of total fleet cost
    pub avg_session_cost: f64,
    pub avg_turn_cost: f64,
    pub peak_day_cost: f64,
    pub trend: TrendDirection,                // up / down / stable
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderCostRow {
    pub provider: String,
    pub cost: f64,
    pub pct_of_total: f64,
    pub tokens: u64,
    pub sessions: u32,
    pub avg_cost_per_1k_tokens: f64,          // Efficiency metric
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelCostRow {
    pub model: String,
    pub provider: String,
    pub cost: f64,
    pub pct_of_total: f64,
    pub tokens: u64,
    pub sessions: u32,
    pub avg_cost_per_session: f64,
    pub avg_tokens_per_session: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCostRow {
    pub tool_name: String,
    pub call_count: u64,
    pub estimated_cost_share: f64,           // % of total cost attributed to this tool
    pub avg_calls_per_session: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyCostPoint {
    pub date: String,                        // "2026-05-21"
    pub cost: f64,
    pub tokens: u64,
    pub sessions: u32,
    pub vessel_count: u32,                  // Active vessels that day
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HourlyHeatmapPoint {
    pub day_of_week: u8,                     // 0=Mon, 6=Sun
    pub hour: u8,                            // 0-23
    pub cost: f64,
    pub session_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeriodChange {
    pub cost_pct_change: f64,                // e.g., +12.5%
    pub token_pct_change: f64,
    pub session_pct_change: f64,
    pub direction: TrendDirection,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TrendDirection { Up, Down, Stable }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionCostSummary {
    pub pi_session_id: String,
    pub vessel_name: String,
    pub cost: f64,
    pub tokens: u64,
    pub turns: u32,
    pub duration_secs: f64,
    pub model: String,
    pub date: String,
}
```

---

## 3. RUST BACKEND: COST TRACKER MODULE

### 3.1 Real-Time Accumulator

```rust
// cost_tracker.rs

impl LiveCostAccumulator {
    pub fn new() -> Self {
        Self::default()
    }

    /// Called on every message_end event with role="assistant".
    /// Updates running totals and checks budget.
    pub fn record_message(
        &mut self,
        usage: &PiUsage,
        vessel_budget: Option<&VesselBudget>,
        session_id: Uuid,
    ) -> (Vec<StateChange>, Option<BudgetStatus>) {
        let mut changes = Vec::new();
        let input_before = self.input_tokens;
        let output_before = self.output_tokens;
        let cost_before = self.total_cost_usd;

        // Accumulate
        self.input_tokens += usage.input;
        self.output_tokens += usage.output;
        self.cache_read_tokens += usage.cache_read;
        self.cache_write_tokens += usage.cache_write;
        self.total_tokens = self.input_tokens + self.output_tokens;
        if let Some(ref cost) = usage.cost {
            self.total_cost_usd += cost.total;
        }

        // Record turn cost
        let turn_cost = TurnCostRecord {
            turn_index: self.turn_costs.len() as u32,
            input_tokens: usage.input,
            output_tokens: usage.output,
            cache_read: usage.cache_read,
            total_tokens: usage.input + usage.output,
            cost_usd: usage.cost.as_ref().map(|c| c.total).unwrap_or(0.0),
            tool_count: 0, // Updated separately when tool calls complete
            duration_ms: 0,  // Updated from timing data
            timestamp: Utc::now(),
        };
        self.turn_costs.push(turn_cost);

        // Update rate calculations
        let elapsed = (Utc::now() - self.session_started_at).num_seconds().max(1) as f64;
        self.tokens_per_second = self.total_tokens as f64 / elapsed;
        self.cost_per_second = self.total_cost_usd / elapsed;

        // Emit state changes
        if self.input_tokens != input_before || self.output_tokens != output_before {
            changes.push(StateChange::CostUpdate {
                session_id,
                total_cost: self.total_cost_usd,
                total_tokens: self.total_tokens,
                delta_cost: self.total_cost_usd - cost_before,
                delta_tokens: self.total_tokens - (input_before + output_before),
            });
        }

        // Check budget
        let budget_status = vessel_budget.map(|b| self.check_budget(b)).flatten();

        (changes, budget_status)
    }

    fn check_budget(&self, budget: &VesselBudget) -> Option<BudgetStatus> {
        if !budget.enabled { return None; }

        let now = Utc::now();

        // Check session limit
        if let Some(max_session) = budget.max_session_usd {
            if self.total_cost_usd >= max_session {
                let pct = self.total_cost_usd / max_session;
                return Some(if budget.stop_at_limit && !self.budget_stop_emitted {
                    self.budget_stop_emitted = true;
                    BudgetStatus::LimitExceeded {
                        limit_type: BudgetLimitType::Session,
                        current: self.total_cost_usd,
                        limit: max_session,
                        percent: pct,
                        action_required: BudgetAction::StopSession,
                    }
                } else {
                    BudgetStatus::LimitExceeded {
                        limit_type: BudgetLimitType::Session,
                        current: self.total_cost_usd,
                        limit: max_session,
                        percent: pct,
                        action_required: BudgetAction::WarnOnly,
                    }
                });
            } else if self.total_cost_usd >= max_session * budget.warning_threshold
                   && !self.budget_warning_emitted {
                self.budget_warning_emitted = true;
                return Some(BudgetStatus::ApproachingWarning {
                    limit_type: BudgetLimitType::Session,
                    current: self.total_cost_usd,
                    limit: max_session,
                    percent: self.total_cost_usd / max_session,
                });
            }
        }

        // Note: Daily/monthly checks require querying accumulated DB records.
        // Those happen via a separate periodic check (see below).

        None
    }
}
```

### 3.2 Persistence Layer

```sql
-- Cost records table
CREATE TABLE IF NOT EXISTS session_costs (
    id              TEXT PRIMARY KEY,
    pi_session_id   TEXT NOT NULL UNIQUE,
    vessel_id       TEXT,
    session_file    TEXT,
    started_at      TEXT NOT NULL,
    ended_at        TEXT NOT NULL,
    duration_secs   REAL DEFAULT 0,

    -- Tokens
    total_input_tokens    INTEGER DEFAULT 0,
    total_output_tokens   INTEGER DEFAULT 0,
    total_cache_read      INTEGER DEFAULT 0,
    total_cache_write     INTEGER DEFAULT 0,
    total_tokens          INTEGER DEFAULT 0,

    -- Cost
    total_cost_usd        REAL DEFAULT 0,

    -- Breakdowns (JSON)
    provider_costs        TEXT DEFAULT '{}',
    model_costs            TEXT DEFAULT '{}',
    tool_breakdown        TEXT DEFAULT '{}',
    files_touched         TEXT DEFAULT '[]',

    -- Activity
    turn_count             INTEGER DEFAULT 0,
    tool_call_count       INTEGER DEFAULT 0,

    -- Model info
    primary_model          TEXT,
    primary_provider       TEXT,

    -- Flags
    had_error              INTEGER DEFAULT 0,

    -- Indexes for queries
    created_at TEXT GENERATED ALWAYS AS (started_at) STORED
);
CREATE INDEX IF NOT EXISTS idx_cost_vessel ON session_costs(vessel_id);
CREATE INDEX IF NOT EXISTS idx_cost_date ON session_costs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_model ON session_costs(primary_model);

-- Daily rollups (pre-computed for dashboard speed)
CREATE TABLE IF NOT EXISTS daily_cost_rollups (
    date            TEXT PRIMARY KEY,           -- '2026-05-21'
    vessel_id       TEXT,                       -- NULL = fleet total
    total_cost      REAL DEFAULT 0,
    total_tokens    INTEGER DEFAULT 0,
    total_sessions  INTEGER DEFAULT 0,
    total_turns     INTEGER DEFAULT 0,
    unique_models   TEXT DEFAULT '[]',          -- JSON array
    error_count     INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_rollup_date ON daily_cost_rollups(date DESC);
CREATE INDEX IF NOT EXISTS idx_rollup_vessel ON daily_cost_rollups(vessel_id, date DESC);
```

### 3.3 IPC Commands

```rust
// ── Real-time ──

#[tauri::command]
async fn cost_live(session_id: Uuid) -> Result<LiveCostSnapshot, BridgeError>
// Returns current accumulator state for active session

#[tauri::command]
async fn cost_set_budget(
    vessel_id: Uuid,
    budget: VesselBudget,
) -> Result<(), BridgeError>

#[tauri::command]
async fn cost_get_budget(vessel_id: Uuid) -> Result<Option<VesselBudget>, BridgeError>

// ── Historical / Dashboard ──

#[tauri::command]
async fn cost_dashboard(
    period: MetricPeriod,
    vessel_id: Option<Uuid>,
) -> Result<CostDashboard, BridgeError>
// The big query — aggregates everything for the dashboard view

#[tauri::command]
async fn cost_vessel_detail(
    vessel_id: Uuid,
    period: MetricPeriod,
) -> Result<VesselCostDetail, BridgeError>

#[derive(Serialize, Deserialize)]
pub struct VesselCostDetail {
    pub vessel: VesselCostRow,
    pub daily_series: Vec<DailyCostPoint>,
    pub sessions: Vec<SessionCostSummary>,
    pub model_usage: Vec<ModelCostRow>,
    pub tool_usage: Vec<ToolCostRow>,
}

#[tauri::command]
async fn cost_top_sessions(
    limit: Option<usize>,               // Default 20
    period: Option<MetricPeriod>,
) -> Result<Vec<SessionCostSummary>, BridgeError>

#[tauri::command]
async fn cost_export_csv(
    vessel_id: Option<Uuid>,
    period: MetricPeriod,
) -> Result<String, BridgeError>
// Returns CSV content string (frontend triggers download)

#[tauri::command]
async fn cost_forecast(
    vessel_id: Option<Uuid>,
) -> Result<CostForecast, BridgeError>
// Linear regression projection based on last 30 days

#[derive(Serialize, Deserialize)]
pub struct CostForecast {
    pub projected_monthly: f64,
    pub projected_daily: f64,
    pub confidence: f64,                   // R² value
    pub trend_days: [f64; 7],             // Next 7 days projected
    pub based_on_days: u32,                // How many days of data
    pub note: String,                      // Human-readable explanation
}
```

---

## 4. FRONTEND: COST UI

### 4.1 Live Cost Meter (In Execution View)

Shown inline in every active session's header:

```
┌──────────────────────────────────────────────────────┐
│ 🧠 Pi Session · glm-5v-turbo ● thinking             │
│ 💰 $0.00312  ·  📊 18,526 tok  ·  ⚡ 1.5k tok/s    │
│ ▓▓▓▓▓▓▓▓▓░░░░░  73% of session budget ($5.00)     │
└──────────────────────────────────────────────────────┘
```

**Behavior:**
- Cost counter updates **every `message_end`** (not every delta — too noisy)
- Token count updates smoothly with a counting animation
- Budget bar appears only when a budget is configured
- Bar color transitions: green (< 60%) → yellow (60-80%) → red (80-100%) → pulsing (> 100%)

```svelte
<!-- lib/components/Cost/LiveCostMeter.svelte -->
<script lang="ts">
  import type { LiveCostSnapshot, VesselBudget } from '$lib/types/pi';

  interface Props {
    snapshot: LiveCostSnapshot | null;
    budget: VesselBudget | null;
  }

  let { snapshot, budget }: Props = $props();

  $: budgetPct = snapshot && budget?.max_session_usd
    ? Math.min(100, (snapshot.total_cost / budget.max_session_usd) * 100)
    : null;

  $: barColor = budgetPct === null ? 'none'
    : budgetPct < 60 ? 'var(--sea-green)'
    : budgetPct < 80 ? 'var(--brass)'
    : budgetPct < 100 ? 'var(--alert-red)'
    : 'var(--alert-red)';

  $: isOverBudget = budgetPct !== null && budgetPct >= 100;
</script>

{#if snapshot}
<div class="live-cost-meter" class:over-budget={isOverBudget}>
  <div class="cost-main">
    <span class="cost-icon">💰</span>
    <span class="cost-value">${snapshot.total_cost.toFixed(4)}</span>
    <span class="cost-separator">·</span>
    <span class="tokens">📊 {formatNumber(snapshot.total_tokens)} tok</span>
    {#if snapshot.tokens_per_sec > 0}
    <span class="cost-separator">·</span>
    <span class="rate">⚡ {formatNumber(snapshot.tokens_per_sec)} tok/s</span>
    {/if}
  </div>

  {#if budget?.enabled && budget?.max_session_usd}
  <div class="budget-bar-container">
    <div class="budget-bar-track">
      <div
        class="budget-bar-fill"
        style="width: {budgetPct}%; background: {barColor};"
        class:pulsing={isOverBudget}
      />
    </div>
    <span class="budget-label">
      {budgetPct!.toFixed(0)}% of ${budget.max_session_usd!.toFixed(2)} session budget
    </span>
  </div>
  {/if}
</div>
{/if}

<style>
  .live-cost-meter {
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    background: rgba(255,255,255,0.03);
    font-size: 11px;
    font-family: var(--font-mono);
  }
  .over-budget { background: rgba(255, 101, 74, 0.08); }
  .cost-main { display: flex; align-items: center; gap: 6px; }
  .cost-value { font-weight: 700; color: var(--foam); }
  .tokens, .rate { color: var(--text-secondary); }
  .cost-separator { color: var(--text-faint); }
  .budget-bar-container { margin-top: 4px; }
  .budget-bar-track {
    height: 3px; border-radius: 2px; background: rgba(255,255,255,0.06);
  }
  .budget-bar-fill {
    height: 100%; border-radius: 2px; transition: width 0.4s ease, background 0.3s ease;
  }
  @keyframes pulse-bar {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  .pulsing { animation: pulse-bar 1s ease-in-out infinite; }
  .budget-label { font-size: 9px; color: var(--text-faint); margin-top: 2px; display: block; }
</style>
```

### 4.2 Fleet Cost Dashboard (Bottom Nav → Charts Tab)

```
┌─ 💰 Fleet Cost Tracker ───────────────────────────────────┐
│                                                            │
│  [Today] [This Week] [This Month] [All Time]   [⬇ CSV]  │
│                                                            │
│  ┌─ Summary Cards ──────────────────────────────────────┐ │
│  │                                                        │ │
│  │  $0.34              1.2M               127            │ │
│  │  Total Cost         Total Tokens       Sessions       │ │
│  │  ↓ 12% vs last wk  ↑ 8% vs last wk    ↑ 3 new       │ │
│  │                                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌─ Daily Sparkline (14 days) ─────────────────────────┐  │
│  │                                                      │  │
│  │  $   │                                              │  │
│  │  0.20 ─  ┐╮╭╯╰╭╮╭╯╰╮╭╯╭╮╰╭╯                      │  │
│  │  0.10 ─╭╯╰╭╯╰╭╯╰╭╯╰╭╯╰╭╯╰                           │  │
│  │       └07 08 09 10 11 12 13 14 15 16 17 18 19 20    │  │
│  │                                                      │  │
│  │  ░░░░░░░░░░░░░░░░░░░░░░░░░                         │  │
│  │  Sessions:  3  5  2  8  4  7  9  6 11  5  8  4  3  │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌─ By Vessel ──────────────┬─ By Provider ─────────────┐ │
│  │                          │                             │ │
│  │ web-dev-cody   ████████  │ zai    ██████████████ 68% │ │
│  │ $0.089 (26%)  86 sess   │ anthropic ████ 22%        │ │
│  │                          │ openai  ██ 10%           │ │
│  │ dialysispal   █████      │                             │ │
│  │ $0.031 (9%)   28 sess   │                             │ │
│  │                          │                             │ │
│  │ idea_factory  ██████████  │ Avg cost/1k tokens:       │ │
│  │ $0.189 (56%) 45 sess   │ zai: $0.0018  anth: $0.0030│ │
│  │                          │ oai: $0.0025              │ │
│  └──────────────────────────┴─────────────────────────────┘ │
│                                                            │
│  ┌─ Tool Cost Distribution ──────────────────────────────┐ │
│  │                                                        │ │
│  │  read  ████████████████████████████  38%  (492 calls) │ │
│  │  edit  ████████████████  22%  (167 calls)             │ │
│  │  bash  ██████████  14%  (203 calls)                   │ │
│  │  write ███████  9%  (41 calls)                        │ │
│  │  grep  ████  6%  (89 calls)                           │ │
│  │  find  ███  5%  (62 calls)                            │ │
│  │  ls    █  3%  (98 calls)                              │ │
│  │  fetch █  2%  (15 calls)                              │ │
│  │  search █ 1%  (8 calls)                               │ │
│  │                                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌─ Activity Heatmap (Last 28 Days) ────────────────────┐ │
│  │        0h  2h  4h  6h  8h  10h 12h 14h 16h 18h 20h 22h│ │
│  │  Mon  ░░ ░░ ░░ ░▒ ▒▒ ▒▒ ▒▒ ██ ███ ██ ▒▒ ▒▒ ░░ ░░  │ │
│  │  Tue  ░░ ░░ ░▒ ▒▒ ▒▒ ██ ███ ███ ▒▒ ▒▒ ░░ ░░ ░░ ░░  │ │
│  │  Wed  ░░ ░░ ░░ ░▒ ▒▒ ▒▒ ██ ███ ███ ██ ▒▒ ▒▒ ░░ ░░  │ │
│  │  Thu  ░░ ░░ ░░ ░░ ░▒ ▒▒ ▒▒ ██ ███ ▒▒ ░░ ░░ ░░ ░░ ░░  │ │
│  │  Fri  ░░ ░░ ░░ ░░ ░░ ░▒ ▒▒ ▒▒ ░░ ░░ ░░ ░░ ░░ ░░ ░░  │ │
│  │  Sat  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░  │ │
│  │  Sun  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░  │ │
│  │                                                        │ │
│  │  Peak: Wed 12:00-14:00  ($0.09, 5 sessions)          │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌─ Forecast ────────────────────────────────────────────┐ │
│  │  📈 At current rate, projected spend:                  │ │
│  │     This month: $4.82  (based on 21 days of data)     │ │
│  │     Per day average: $0.16                             │ │
│  │  Confidence: 87% (R²=0.87)                            │ │
│  │                                                        │ │
│  │  [Set monthly budget]                                  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 4.3 Budget Configuration Dialog

```
┌─ 💰 Budget Settings — web-dev-cody ───────────────────────┐
│                                                             │
│  ☑ Enable budget monitoring                                │
│                                                             │
│  Limits                                                     │
│  ┌─────────────────────┬──────────┐                        │
│  │ Per session:         │ $5.00   │  Max cost per Pi launch │
│  ├─────────────────────┼──────────┤                        │
│  │ Per day:             │ $20.00   │  Reset at midnight      │
│  ├─────────────────────┼──────────┤                        │
│  │ Per month:           │ $100.00  │  Resets 1st of month   │
│  └─────────────────────┴──────────┘                        │
│                                                             │
│  Warning threshold:  80%  [━━━━━━●━━]  Show warning at 80%  │
│                                                             │
│  When limit reached:                                        │
│  ○ Warn only (default)                                      │
│  ○ Stop current session after this turn                     │
│  ○ Block new sessions until reset                           │
│                                                             │
│  Current spending today: $3.42 / $20.00 (17%)              │
│                                                             │
│                    [Save] [Cancel]                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. VISUALIZATION COMPONENTS

### 5.1 Mini Sparkline (CSS-only, no chart library needed for MVP)

```svelte
<!-- lib/components/Cost/Sparkline.svelte -->
<script lang="ts">
  interface Props {
    values: number[];
    width?: number;
    height?: number;
    color?: string;
  }

  let { values, width = 120, height = 24, color = 'var(--bridge-glow)' }: Props = $props();

  $: min = Math.min(...values);
  $: max = Math.max(...values);
  $: range = max - min || 1;
  $: points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  $: areaPoints = `0,${height} ${points} ${width},${height}`;
</script>

<svg {width} {height} viewBox="0 0 {width} {height}" class="sparkline">
  <!-- Area fill -->
  <polygon points={areaPoints} fill="{color}" opacity="0.1" />
  <!-- Line -->
  <polyline points={points} fill="none" stroke="{color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
  <!-- Dot at latest value -->
  <circle cx={width} cy={height - ((values[values.length - 1] - min) / range * height} r="2" fill="{color}" />
</svg>

<style>
  .sparkline { display: block; }
</style>
```

### 5.2 Horizontal Bar (for vessel/provider breakdowns)

```svelte
<!-- lib/components/Cost/BarChart.svelte -->
<script lang="ts">
  interface BarItem { label: string; value: number; pct: number; sublabel?: string; color?: string }

  interface Props {
    items: BarItem[];
    max_value?: number;
    show_pct?: boolean;
  }

  let { items, max_value, show_pct = true }: Props = $props();
  $: maxValue = max_value || Math.max(...items.map(i => i.value), 0.01);
</script>

<div class="bar-chart">
  {#each items as item (item.label)}
  <div class="bar-row">
    <div class="bar-label">{item.label}</div>
    <div class="bar-track">
      <div
        class="bar-fill"
        style="width: {(item.value / maxValue * 100).toFixed(1)}%; background: {item.color || 'var(--bridge-glow)'}"
      />
    </div>
    <div class="bar-value">
      <span class="bar-primary">${item.value.toFixed(2)}</span>
      {#if show_pct}
      <span class="bar-pct">({item.pct.toFixed(0)}%)</span>
      {/if}
      {#if item.sublabel}
      <span class="bar-sub">{item.sublabel}</span>
      {/if}
    </div>
  </div>
  {/each}
</div>

<style>
  .bar-chart { display: flex; flex-direction: column; gap: 6px; }
  .bar-row { display: flex; align-items: center; gap: 10px; font-size: 11px; }
  .bar-label { width: 100px; text-align: right; color: var(--text-secondary); flex-shrink: 0; }
  .bar-track { flex: 1; height: 14px; background: rgba(255,255,255,0.04); border-radius: 3px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 3px; transition: width 0.5s ease; min-width: 2px; }
  .bar-value { width: 120px; text-align: right; font-family: var(--font-mono); color: var(--text-dim); flex-shrink: 0; }
  .bar-primary { color: var(--foam); font-weight: 600; }
  .bar-pct { color: var(--text-faint); font-size: 9px; }
  .bar-sub { color: var(--text-faint); font-size: 9px; display: block; }
</style>
```

### 5.3 Heatmap Grid (Activity by day/hour)

```svelte
<!-- lib/components/Cost/HeatmapGrid.svelte -->
<script lang="ts">
  interface Props {
    data: Array<{ day: number; hour: number; cost: number; sessions: number }>;
    max_cost?: number;
  }

  let { data, max_cost }: Props = $props();
  $: maxC = max_cost || Math.max(...data.map(d => d.cost), 0.01);

  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const HOURS = Array.from({ length: 24 }, (_, i) => i);

  function getCell(day: number, hour: number) {
    return data.find(d => d.day === day && d.hour === hour);
  }

  function intensity(cost: number): number {
    return cost / maxC;
  }
</script>

<div class="heatmap-grid">
  <div class="heatmap-corner"></div>
  {#each HOURS as hour}
    <div class="hour-label">{String(hour).padStart(2, '0')}</div>
  {/each}

  {#each DAYS as _, dayIdx}
    <div class="day-label">{DAYS[dayIdx]}</div>
    {#each HOURS as hour}
      {@const cell = getCell(dayIdx, hour)}
      <div
        class="heatmap-cell"
        class:has-data={cell !== undefined}
        style="--intensity: {cell ? intensity(cell.cost) : 0}"
        title={cell ? `${DAYS[dayIdx]} ${String(hour).padStart(2, '0')}:00 — $${cell.cost.toFixed(2)} (${cell.sessions} sessions)` : ''}
      />
    {/each}
  {/each}
</div>

<style>
  .heatmap-grid {
    display: grid;
    grid-template-columns: auto repeat(24, 1fr);
    grid-template-rows: repeat(8, 1fr);
    gap: 2px;
    font-size: 9px;
  }
  .heatmap-corner { grid-row: 1; grid-column: 1; }
  .hour-label { grid-column: span 1; text-align: center; color: var(--text-faint); font-family: var(--font-mono); font-size: 8px; }
  .day-label { grid-column: 1; display: flex; align-items: center; justify-content: flex-end; padding-right: 4px; color: var(--text-faint); font-size: 9px; }
  .heatmap-cell {
    aspect-ratio: 1;
    border-radius: 2px;
    background: rgba(120, 221, 232, calc(0.03 + var(--intensity) * 0.35));
    transition: background 0.15s ease;
    cursor: default;
  }
  .heatmap-cell.has-data:hover {
    outline: 1px solid var(--bridge-glow);
    outline-offset: 1px;
    background: rgba(120, 221, 232, calc(0.1 + var(--intensity) * 0.5));
  }
</style>
```

---

## 6. PERFORMANCE

| Operation | Target | Strategy |
|-----------|--------|----------|
| Live cost update (per message_end) | < 1ms | In-memory accumulator, no I/O |
| Persist session cost on end | < 10ms | Single INSERT |
| Dashboard query (30-day, 10 vessels) | < 200ms | Use daily rollup table, avoid full scan |
| Daily rollup computation | < 500ms | Run once on app startup or scheduled |
| CSV export (all time, all vessels) | < 2s | Streaming write, no memory bloat |
| Forecast calculation | < 100ms | Simple linear regression on rollup data |

---

## SUMMARY

| Layer | What's Defined |
|-------|----------------|
| **Data model** | `SessionCostRecord`, `LiveCostAccumulator`, `VesselBudget`, `CostDashboard`, full aggregation types |
| **Live tracker** | In-memory accumulator with per-event updates, rate calculation, budget checking |
| **Budget system** | Per-vessel daily/session/month limits, warning thresholds, auto-stop actions |
| **Persistence** | SQLite schema with indexes, daily pre-computed rollups |
| **IPC commands** | 10 commands: live snapshot, budget CRUD, dashboard, detail, top sessions, CSV export, forecast |
| **UI components** | `LiveCostMeter` (inline), full dashboard layout wireframe, budget config dialog |
| **Visualizations** | CSS sparkline, horizontal bar chart, activity heatmap (all no-dependency) |
| **Performance** | 7 targets with strategies |

**Ready to implement.** 🔨
