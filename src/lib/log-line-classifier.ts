/// LogLineClassifier — semantic color-coding for PTY terminal output.
///
/// Inspects raw text lines from PTY sessions and classifies them into
/// semantic categories (Error, Warn, Prompt, Info, Dim, Plain), then
/// wraps with ANSI escape codes so xterm.js renders colors natively.
///
/// Priority order (highest first): Error > Warn > Prompt > Info > Dim > Plain
///
/// Usage:
///   import { classifyAndColorize } from "./log-line-classifier";
///   const colored = classifyAndColorize(rawOutput);
///   term.write(colored);  // xterm.js renders with semantic colors

import { LogLineClass } from "./terminal-types";

export { LogLineClass };

// ─── Configuration ────────────────────────────────────────────────

/** Pattern rules for each log line classification category. */
export interface LogLineClassifierConfig {
  errorPatterns: RegExp[];
  warnPatterns: RegExp[];
  promptPatterns: RegExp[];
  infoPatterns: RegExp[];
  dimPatterns: RegExp[];
}

/** Default pattern set tuned for Pi / CLI / shell output. */
export const DEFAULT_CLASSIFIER_CONFIG: LogLineClassifierConfig = {
  errorPatterns: [
    /^(?:error|err|failed|failure|fatal|panic)[\s:]/i,
    /^Traceback \(most recent call last\)/,
    /\bpanicked at\b/,
    /^E\d{4}/, // Windows/Go-style error codes like EACCESS
    /^\s*at\s+.*\(\S+:\d+:\d+\)/, // JS/Java stack trace lines
  ],
  warnPatterns: [
    /^(?:warning|warn)[\s:]/i,
    /^(?:WARNING|WARN)\b/,
    /\bis deprecated\b/i,
    /\bdeprecation warning\b/i,
  ],
  promptPatterns: [
    /^[>$#%❯>]\s/, // Shell prompts: $ > # % ❯ >
    /^\?\s/,      // Question prompts
    /^pi>\s/,     // Pi-specific prompt
    /^=>\s/,      // REPL prompts (Elixir, IEx)
    /^\n?>\s/,   // Nested REPL
  ],
  infoPatterns: [
    /^(?:info|information|success|ok)[\s:]/i,
    /^(?:INFO|OK)\b/,
    /^✓\s/,
    /^✔\s/,
    /\ball tests passed\b/i,
    /\bbuild completed\b/i,
  ],
  dimPatterns: [
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/, // ISO timestamps
    /^\[\w+\]\s/,                                 // [context] prefixes
    /^Step\s+\d+\/\d+/i,                          // Step N/M progress
    /^\s*\d+(\.\d+)?%/,                           // Progress percentages
  ],
};

// ─── Classification Engine ───────────────────────────────────────

/**
 * Classify a single line of PTY output into a semantic category.
 *
 * Checks patterns in priority order: Error > Warn > Prompt > Info > Dim > Plain.
 * First matching category wins.
 */
export function classifyLine(
  line: string,
  config: LogLineClassifierConfig = DEFAULT_CLASSIFIER_CONFIG,
): LogLineClass {
  if (!line || !line.trim()) return LogLineClass.Plain;

  // Priority-ordered checks
  if (config.errorPatterns.some((re) => re.test(line))) return LogLineClass.Error;
  if (config.warnPatterns.some((re) => re.test(line))) return LogLineClass.Warn;
  if (config.promptPatterns.some((re) => re.test(line))) return LogLineClass.Prompt;
  if (config.infoPatterns.some((re) => re.test(line))) return LogLineClass.Info;
  if (config.dimPatterns.some((re) => re.test(line))) return LogLineClass.Dim;

  return LogLineClass.Plain;
}

// ─── ANSI Color Mapping ──────────────────────────────────────────

/** ANSI escape sequences for each log line class. */
const ANSI_MAP: Readonly<Record<LogLineClass, string>> = {
  [LogLineClass.Error]: "\x1b[1;91m", // bright red + bold
  [LogLineClass.Warn]: "\x1b[1;93m",  // bright yellow + bold
  [LogLineClass.Prompt]: "\x1b[1;92m", // bright green + bold
  [LogLineClass.Info]: "\x1b[1;96m",  // bright cyan + bold
  [LogLineClass.Dim]: "\x1b[2;90m",   // dim + bright gray
  [LogLineClass.Plain]: "",            // no coloring
};

/** ANSI reset sequence. */
const ANSI_RESET = "\x1b[0m";

/**
 * Get the ANSI escape sequence prefix for a given log line class.
 * Returns empty string for Plain class (no modification needed).
 */
export function getAnsiForClass(cls: LogLineClass): string {
  return ANSI_MAP[cls];
}

// ─── Combined Classify + Colorize ────────────────────────────────

/**
 * Classify and colorize a raw output string (may contain multiple lines).
 *
 * Each line is independently classified and wrapped with appropriate
 * ANSI escape codes. Lines that are already partially colored (contain
 * ANSI escapes) get the classification wrapper around their existing content.
 *
 * @param text - Raw PTY output (single or multi-line)
 * @param config - Optional custom pattern configuration
 * @returns Text with ANSI color codes injected per-line
 */
export function classifyAndColorize(
  text: string,
  config?: LogLineClassifierConfig,
): string {
  if (!text) return text;

  return text
    .split("\n")
    .map((line) => {
      const cls = classifyLine(line, config);
      if (cls === LogLineClass.Plain) return line;
      const ansi = ANSI_MAP[cls];
      return `${ansi}${line}${ANSI_RESET}`;
    })
    .join("\n");
}

// ─── Batch API ───────────────────────────────────────────────────

/** Result of classifying a single line with position info. */
export interface ClassifiedLine {
  /** Original line text */
  text: string;
  /** Classification result */
  class: LogLineClass;
  /** 0-based line index in the input */
  index: number;
}

/**
 * Classify all lines in a multi-line string, returning structured results.
 * Useful for building custom renderers that need per-line metadata.
 */
export function classifyLines(
  text: string,
  config?: LogLineClassifierConfig,
): ClassifiedLine[] {
  if (!text) return [];

  return text.split("\n").map((text, index) => ({
    text,
    class: classifyLine(text, config),
    index,
  }));
}
