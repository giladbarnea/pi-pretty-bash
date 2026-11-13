import { stripVTControlCharacters } from "node:util";
import {
  highlightCode,
  keyHint,
  truncateToVisualLines,
  type BashToolDetails,
  type ExtensionAPI,
  type Theme,
  type ToolRenderers,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import { highlight } from "cli-highlight";

const JSON_HIGHLIGHT_MAX_BYTES = 200 * 1024;
const PREVIEW_ROWS = 10;
const RESET = "\x1b[0m";
const BLACK_BACKGROUND = "\x1b[48;5;16m";
const SURFACE_TEXT = "\x1b[38;5;252m";

type BashArguments = { command?: string; timeout?: number };
type Result = Parameters<NonNullable<ToolRenderers["renderResult"]>>[0];
type RenderState = { startedAt?: number; endedAt?: number; timer?: ReturnType<typeof setInterval> };
type Context = Omit<Parameters<NonNullable<ToolRenderers["renderCall"]>>[2], "state"> & { state: RenderState };
type ParsedOutput = { body: string; status: string };

class BashDisplay implements Component {
  private width?: number;
  private lines?: string[];
  private draw: (width: number) => string[];
  private background: boolean;

  constructor(draw: (width: number) => string[], background = false) {
    this.draw = draw;
    this.background = background;
  }

  invalidate(): void {
    this.lines = undefined;
  }

  render(width: number): string[] {
    if (this.lines && this.width === width) return this.lines;
    this.width = width;
    this.lines = this.draw(Math.max(1, width - 1)).map(line => this.background ? blackBackground(line, width) : truncateToWidth(line, width));
    return this.lines;
  }
}

/** Fill a terminal row with black, restoring its surface colors after nested styling resets.
 * @example stripVTControlCharacters(blackBackground("git status", 12)) // "git status  "
 */
function blackBackground(line: string, width: number): string {
  const padded = truncateToWidth(line, width, "...", true);
  const styled = padded.replace(/\x1b\[(?:0)?m/g, `$&${SURFACE_TEXT}${BLACK_BACKGROUND}`)
    .replace(/\x1b\[(?:22;)?39m/g, `$&${SURFACE_TEXT}`).replaceAll("\x1b[49m", BLACK_BACKGROUND);
  return `${SURFACE_TEXT}${BLACK_BACKGROUND}${styled}${RESET}`;
}

/** Apply the old Bash token palette without its hand-written HTML parser.
 * @example bashColors('echo "$HOME"', theme) // Built-ins use syntaxFunction; variables use syntaxVariable.
 */
function bashColors(command: string, theme: Theme): string {
  const colors = {
    attr: "syntaxVariable", built_in: "syntaxFunction", comment: "syntaxComment",
    function: "syntaxFunction", keyword: "syntaxKeyword", literal: "syntaxNumber",
    meta: "muted", number: "syntaxNumber", operator: "syntaxOperator",
    params: "syntaxVariable", property: "syntaxVariable", punctuation: "syntaxPunctuation",
    string: "syntaxString", subst: "syntaxOperator", symbol: "syntaxVariable",
    title: "syntaxFunction", type: "syntaxType", variable: "syntaxVariable",
  } as const;
  const formatters = Object.fromEntries(Object.entries(colors).map(([scope, token]) => [scope, (text: string) => theme.fg(token, text)]));
  return highlight(command, { language: "bash", ignoreIllegals: true, theme: { ...formatters, default: (text: string) => text } });
}

/** Name the command after environment assignments and common launch prefixes.
 * @example commandName('MODE=test env bash script.sh') // "bash"
 */
function commandName(command: string): string {
  return command.trim().split(/\s+/).find(word => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word) && !["command", "env", "nohup", "sudo", "time"].includes(word)) ?? "Bash";
}

/** Describe multiline commands, pipelines, heredocs and timeouts.
 * @example commandFacts('cat file | sort', undefined) // ["1 pipe"]
 */
function commandFacts(command: string, timeout: number | undefined): string[] {
  const lines = command.split("\n").length;
  const pipes = command.match(/(?<!\|)\|(?!\|)/g)?.length ?? 0;
  return [
    ...(lines > 1 ? [`${lines} lines`] : []),
    ...(pipes > 0 ? [`${pipes} pipe${pipes === 1 ? "" : "s"}`] : []),
    ...(/(^|[^<])<<-?/.test(command) ? ["heredoc"] : []),
    ...(typeof timeout === "number" ? [`timeout ${timeout}s`] : []),
  ];
}

/** Draw a Bash input or output box at the available width.
 * @example box(["hello"], 12, theme) // A three-row box containing hello.
 */
function box(rows: string[], width: number, theme: Theme, caption = ""): string[] {
  const border = (text: string) => theme.fg("borderMuted", text);
  const innerWidth = Math.max(1, width - 4);
  const title = truncateToWidth(caption, Math.max(1, width - 6));
  const top = title
    ? `${border("┌─")} ${title} ${border("─".repeat(Math.max(1, width - 5 - visibleWidth(title))) + "┐")}`
    : border(`┌${"─".repeat(Math.max(1, width - 2))}┐`);
  return [
    top,
    ...rows.map(row => `${border("│")} ${row}${" ".repeat(Math.max(0, innerWidth - visibleWidth(row)))}${RESET} ${border("│")}`),
    border(`└${"─".repeat(Math.max(1, width - 2))}┘`),
  ];
}

/** Draw the command, using a numbered box only for multiline input; collapsed boxes hide their middle rows.
 * @example commandRows({command: "echo hi"}, theme, false, false).render(80) // A syntax-colored Bash header.
 */
function commandRows(args: BashArguments, theme: Theme, pending: boolean, expanded: boolean): Component {
  const command = displayText(args.command ?? "");
  const sourceLines = command.split("\n");
  const highlighted = bashColors(command, theme).split("\n");
  const firstLine = sourceLines[0].trim() || "…";
  const firstLineColored = bashColors(firstLine, theme);
  const prefix = `${theme.fg(pending ? "warning" : "accent", "● ")}${theme.bold("Bash ")}`;
  const facts = commandFacts(command, args.timeout);
  const suffix = facts.length ? theme.fg("dim", ` · ${facts.join(" · ")}`) : "";
  const candidates = [
    `${prefix}${firstLineColored}${suffix}`,
    `${prefix}${firstLineColored}`,
    `${prefix}${theme.fg("accent", commandName(command))}${suffix}`,
    `${prefix}${theme.fg("accent", commandName(command))}`,
    prefix.trimEnd(),
  ];
  return new BashDisplay(width => {
    const header = candidates.find(candidate => visibleWidth(candidate) <= width) ?? candidates[4];
    if (sourceLines.length === 1 && visibleWidth(candidates[0]) <= width) return [header];
    const numberWidth = sourceLines.length > 1 ? Math.max(2, String(sourceLines.length).length) : 0;
    const codeWidth = Math.max(1, width - 4 - (numberWidth ? numberWidth + 1 : 0));
    const rows = highlighted.flatMap((line, index) => wrapTextWithAnsi(line || " ", codeWidth).map((segment, segmentIndex) => {
      const number = segmentIndex === 0 ? theme.fg("muted", String(index + 1).padStart(numberWidth)) : " ".repeat(numberWidth);
      return numberWidth ? `${number} ${segment}` : segment;
    }));
    if (expanded || rows.length <= PREVIEW_ROWS) return [header, ...box(rows, width, theme)];
    const hint = wrapTextWithAnsi(`${theme.fg("muted", `… ${rows.length - PREVIEW_ROWS} more lines · `)}${keyHint("app.tools.expand", "to expand")}`, Math.max(1, width - 4));
    return [header, ...box([...rows.slice(0, PREVIEW_ROWS / 2), ...hint, ...rows.slice(-PREVIEW_ROWS / 2)], width, theme)];
  }, true);
}

/** Remove untrusted terminal instructions before applying renderer-owned styling.
 * @example displayText('\x1b[31mhello\x1b[0m\x07') // "hello"
 */
function displayText(text: string): string {
  return stripVTControlCharacters(text).replace(/\r\n|\r/g, "\n").replace(/\t/g, "   ").replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
}

/** Interpret Pi's error footer only when Pi marks the call as failed.
 * @example parseOutput("Command exited with code 99", false, false) // {body: "Command exited with code 99", status: "✓"}
 */
function parseOutput(output: string, isError: boolean, partial: boolean): ParsedOutput {
  const body = displayText(output).trimEnd();
  if (partial) return { body, status: "running" };
  if (!isError) return { body, status: "✓" };
  const match = /(?:^|\n)(Command exited with code (\d+)|Command aborted|Command timed out after (\d+) seconds(?:\. [^\n]*)?)\s*$/.exec(body);
  if (!match) return { body, status: "✗ failed" };
  const status = match[2] ? `✗ exit ${match[2]}` : match[3] ? `✗ timeout ${match[3]}s` : "✗ aborted";
  return { body: body.slice(0, match.index).trimEnd(), status };
}

/** Spell a byte count in kB, using Pi's 1024-byte unit so it matches Pi's truncation notices.
 * @example kilobytes(588895) // "575.1 kB"
 */
function kilobytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} kB`;
}

/** Recognize complete JSON within the highlighting budget, without reformatting it.
 * @example isJson('{"enabled":true}') // true
 */
function isJson(output: string): boolean {
  if (output.length > JSON_HIGHLIGHT_MAX_BYTES || Buffer.byteLength(output, "utf8") > JSON_HIGHLIGHT_MAX_BYTES) return false;
  try {
    JSON.parse(output);
    return true;
  } catch {
    return false;
  }
}

export default function prettyBash(pi: ExtensionAPI): void {
  const active = new Set<RenderState>();
  const finish = (state: RenderState): void => {
    if (state.timer) clearInterval(state.timer);
    state.timer = undefined;
    state.endedAt ??= Date.now();
    active.delete(state);
  };
  const stopTimers = (): void => { for (const state of active) finish(state); };
  pi.on("agent_end", stopTimers);
  pi.on("session_shutdown", stopTimers);

  const renderers: ToolRenderers = {
    renderShell: "self",
    renderCall(args: unknown, theme: Theme, context: Context) {
      const { state } = context;
      if (context.executionStarted && context.isPartial && state.startedAt === undefined && state.endedAt === undefined) {
        state.startedAt = Date.now();
        state.timer = setInterval(context.invalidate, 1000);
        state.timer.unref?.();
        active.add(state);
      }
      if (!context.isPartial) finish(state);
      return commandRows((args ?? {}) as BashArguments, theme, context.executionStarted && context.isPartial && state.endedAt === undefined, context.expanded);
    },
    renderResult(result: Result, options, theme: Theme, context: Context) {
      const output = result.content.filter(part => part.type === "text").map(part => part.text).join("\n");
      const details = result.details as BashToolDetails | undefined;
      const parsed = parseOutput(output, context.isError, options.isPartial);
      if (details?.truncation?.truncated) parsed.body = parsed.body.replace(/\n*\[Showing [^\]]*\]\s*$/, "");
      if (!options.isPartial) finish(context.state);
      const duration = context.durationMs ?? (context.state.startedAt === undefined ? undefined : (context.state.endedAt ?? Date.now()) - context.state.startedAt);
      const truncation = details?.truncation;
      const count = parsed.body ? parsed.body.split("\n").length : 0;
      const countLabel = truncation?.truncated ? `${truncation.outputLines}/${truncation.totalLines} lines` : `${count} line${count === 1 ? "" : "s"}`;
      const caption = [
        theme.fg(options.isPartial ? "warning" : context.isError ? "error" : "success", parsed.status),
        ...(duration === undefined ? [] : [theme.fg("muted", `${(duration / 1000).toFixed(1)}s`)]),
        ...(count ? [theme.fg("muted", countLabel)] : []),
        ...(truncation?.truncated ? [`${theme.fg("warning", "truncated")} ${theme.fg("dim", `${kilobytes(truncation.outputBytes)} / ${kilobytes(truncation.totalBytes)}`)}`] : []),
      ].join(theme.fg("dim", " · "));
      const highlighted = !options.isPartial && !truncation?.truncated && output.length <= JSON_HIGHLIGHT_MAX_BYTES && Buffer.byteLength(output, "utf8") <= JSON_HIGHLIGHT_MAX_BYTES && isJson(parsed.body);
      const styled = highlighted ? highlightCode(parsed.body, "json").join("\n") : parsed.body.split("\n").map(line => theme.fg("toolOutput", line)).join("\n");
      return new BashDisplay(width => {
        if (!parsed.body.trim()) return ["", `${caption}${theme.fg("dim", " · ")}${theme.fg("muted", options.isPartial ? "waiting for output" : "no output")}`];
        const innerWidth = Math.max(1, width - 4);
        const { skippedCount, visualLines } = truncateToVisualLines(styled, options.expanded ? Infinity : PREVIEW_ROWS, innerWidth);
        const hint = skippedCount ? wrapTextWithAnsi(`${theme.fg("muted", `… ${skippedCount} earlier lines · `)}${keyHint("app.tools.expand", "to expand")}`, innerWidth) : [];
        const outputPath = details?.fullOutputPath ? wrapTextWithAnsi(theme.fg("muted", `Full output: ${displayText(details.fullOutputPath)}`), width) : [];
        return ["", ...box([...hint, ...visualLines], width, theme, caption), ...outputPath];
      });
    },
  };
  pi.registerToolRenderer((name, next) => name === "bash" ? renderers : next());
}
