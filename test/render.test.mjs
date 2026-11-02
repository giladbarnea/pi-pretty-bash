import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { createAgentSession, createBashToolDefinition, DefaultResourceLoader, initTheme, SessionManager, SettingsManager, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import prettyBash from "../index.ts";

initTheme("dark", false);
const native = createBashToolDefinition(process.cwd());
let resolver;
const handlers = new Map();
prettyBash({
  registerToolRenderer: (registered) => { resolver = registered; },
  on: (event, handler) => { handlers.set(event, handler); },
});
const definition = { ...native, ...resolver("bash", () => native) };

function render(command, output, { width = 80, expanded = false, isError = false, details, partial = false } = {}) {
  const component = new ToolExecutionComponent("bash", "fixture", { command }, { showImages: false }, definition, { requestRender() {} }, process.cwd());
  component.setExpanded(expanded);
  const result = { content: [{ type: "text", text: output }], details, isError, durationMs: partial ? undefined : 1200 };
  component.updateResult(result, partial);
  const lines = component.render(width);
  return { component, result, lines, plain: lines.map(stripVTControlCharacters).join("\n") };
}

function colorCount(line) {
  return new Set(line.match(/\x1b\[(?:38;[^m]+|3[0-7])m/g)).size;
}

test("short commands have syntax colors and results use the old rich Bash box", () => {
  const command = 'name="Ada"; printf "%s\\n" "$name"';
  const { lines, plain } = render(command, "Ada\n");
  assert.match(plain, /● Bash name="Ada"; printf/, "The familiar rich Bash header must replace the native $ header");
  assert.match(plain, /┌─ ✓ · 1\.2s · 1 line/, "The result box must name success, duration and line count");
  assert.match(plain, /│ Ada\s+│/, "Actual output must appear inside its box without expanding");
  const commandLine = lines.find(line => stripVTControlCharacters(line).includes('name="Ada"'));
  const colors = new Set(commandLine.match(/\x1b\[(?:38;[^m]+|3[0-7])m/g));
  assert.ok(colors.size >= 3, `Short commands need token colors, not one accent color: ${colors.size} colors`);
  assert.equal((plain.match(/┌/g) ?? []).length, 1, "A short command must not gain an unnecessary command box");
});

test("multiline input retains its numbered command box and complete text", () => {
  const command = '# Check services\nfor service in api worker; do\n  printf "%s\\n" "$service"\ndone';
  const { plain } = render(command, "api\nworker\n");
  assert.match(plain, /│\s+1 # Check services/, "Command line numbers must start at 1");
  assert.match(plain, /│\s+4 .*done/, "The last command line must remain visible");
  assert.equal((plain.match(/┌/g) ?? []).length, 2, "Multiline input and output must have separate boxes");
});

test("long single-line commands wrap without losing their end", () => {
  const command = 'printf "padding"; '.repeat(20) + 'printf "COMMAND_END"';
  for (const expanded of [false, true]) {
    const { plain } = render(command, "result", { expanded, width: 44 });
    assert.ok(plain.includes('"COMMAND_END"'), "The complete command must remain inspectable in both views");
    assert.doesNotMatch(plain, /│\s+1 printf/, "A single-line command must not get a meaningless number gutter");
  }
});

for (const expanded of [false, true]) {
  for (const width of [40, 80]) {
    test(`JSON gets colors without changing data (expanded=${expanded}, width=${width})`, () => {
      const output = '{\n  "status": "ok",\n  "checks": 12,\n  "cached": false\n}';
      const { lines, plain, result } = render("jq . result.json", output, { expanded, width });
      assert.equal(result.content[0].text, output, "Display must not change the result sent to the model");
      assert.match(plain, /"status": "ok"/, "JSON spacing and values must survive rendering");
      const row = lines.find(line => stripVTControlCharacters(line).includes('"status"'));
      assert.ok(colorCount(row) >= 3, "JSON strings and keys must not be one plain output color");
    });
  }
}

test("streamed output stays visible and receives JSON colors only on completion", () => {
  const output = '{"status":"ok"}';
  const { component, lines } = render("query", output, { partial: true });
  const partialRow = lines.find(line => stripVTControlCharacters(line).includes(output));
  assert.ok(partialRow, "Partial output must be shown immediately");
  const partialColors = colorCount(partialRow);
  component.updateResult({ content: [{ type: "text", text: output }], details: undefined, isError: false, durationMs: 1200 });
  const finalRow = component.render(80).find(line => stripVTControlCharacters(line).includes(output));
  assert.ok(colorCount(finalRow) > partialColors, "Only the complete JSON result should be syntax highlighted");
});

for (const output of ["hello world", "enabled: true\ncount: 3", "<enabled>true</enabled>"]) {
  test(`unrecognized output stays plain: ${output.split("\n")[0]}`, () => {
    const { lines, result } = render("inspect", output);
    assert.equal(result.content[0].text, output);
    const row = lines.find(line => stripVTControlCharacters(line).includes(output.split("\n")[0]));
    assert.ok(colorCount(row) <= 2, "Do not guess additional output languages");
  });
}

test("collapsed output keeps ten visual tail rows and expansion reveals the start", () => {
  const output = Array.from({ length: 30 }, (_, index) => `row-${index + 1}`).join("\n");
  const collapsed = render("inspect", output, { width: 60 });
  assert.match(collapsed.plain, /20 earlier lines/, "The hidden-line count must describe the omitted rows");
  assert.doesNotMatch(collapsed.plain, /│ row-1\s/, "Collapsed output must keep the tail, not the beginning");
  assert.match(collapsed.plain, /│ row-30\s/, "The final output row must stay visible");
  const expanded = render("inspect", output, { width: 60, expanded: true });
  assert.match(expanded.plain, /│ row-1\s/, "Expansion must reveal the first output row");
  assert.doesNotMatch(expanded.plain, /earlier lines/);
});

test("success output that resembles a failure footer stays successful and visible", () => {
  const { plain } = render("echo status", "Command exited with code 99");
  assert.match(plain, /┌─ ✓/, "The actual error flag, not output text, determines success");
  assert.match(plain, /│ Command exited with code 99/, "Do not consume text as metadata on success");
  assert.doesNotMatch(plain, /✗/);
});

for (const [footer, caption] of [
  ["Command exited with code 7", "✗ exit 7"],
  ["Command aborted", "✗ aborted"],
  ["Command timed out after 3 seconds", "✗ timeout 3s"],
]) {
  test(`failed calls show their status once: ${caption}`, () => {
    const { plain } = render("failing command", `diagnostic\n\n${footer}`, { isError: true });
    assert.ok(plain.includes(caption), "The error caption must retain the reason");
    assert.match(plain, /│ diagnostic\s+│/, "The command's diagnostic output must remain visible");
    assert.ok(!plain.includes(footer), "The footer should become a caption, not duplicated output");
  });
}

test("truncated results retain the complete-output path and accurate summary", () => {
  const details = { fullOutputPath: "/tmp/complete-output.txt", truncation: { truncated: true, outputLines: 1, totalLines: 500 } };
  const { plain } = render("large command", "kept\n\n[Showing lines 500-500 of 500. Full output: /tmp/complete-output.txt]", { details });
  assert.match(plain, /1\/500 lines · truncated/, "The caption must use the producer's truncation metadata");
  assert.match(plain, /Full output: \/tmp\/complete-output.txt/, "The complete output must remain findable");
  assert.doesNotMatch(plain, /\[Showing lines/, "Do not repeat the producer's truncation footer inside the box");
});

test("empty output has a compact success summary", () => {
  const { plain } = render("true", "");
  assert.match(plain, /✓ · 1\.2s · no output/);
  assert.doesNotMatch(plain, /┌/, "Do not draw an empty output box");
});

test("terminal controls in output are display-only data, not terminal instructions", () => {
  const output = "before\x1b[2Jcleared\x1b[5Aup\x1b]0;evil-title\x07\x1b[31mred\x1b[0m\x00\x07bell after";
  for (const partial of [false, true]) {
    const { lines, plain, result } = render("printf ...", output, { partial, expanded: true });
    const withoutStyles = lines.join("\n").replace(/\x1b\[[\d;]*m/g, "");
    assert.doesNotMatch(withoutStyles, /[\x00-\x08\x0b-\x1f\x7f-\x9f]/, "Only renderer-generated styling may reach terminal rows");
    assert.match(plain, /beforeclearedupredbell after/, "Visible output must survive removing terminal instructions");
    assert.equal(result.content[0].text, output, "Sanitization must not change model-facing output");
    assert.ok(!lines.join("\n").includes("\x1b[31m"), "Source-provided color sequences must not survive");
  }
});

test("command input and recovery paths cannot inject terminal controls", () => {
  const controls = "\x1b[2J\x1b[5A\x1b]52;c;YWJj\x07\x00\x07\x08\x7f\x9b2J";
  const command = `printf 'hello${controls} world'\necho END`;
  const details = { fullOutputPath: `/tmp/${controls}result.txt` };
  const before = structuredClone(details);
  for (const width of [20, 80]) {
    const { lines, result } = render(command, "safe", { details, expanded: true, width });
    const withoutStyles = lines.join("\n").replace(/\x1b\[[\d;]*m/g, "");
    assert.doesNotMatch(withoutStyles, /[\x00-\x08\x0b-\x1f\x7f-\x9f]/, "Commands and metadata are untrusted display text too");
    assert.deepEqual(result.details, before, "Rendering must not mutate producer metadata");
    assert.ok(lines.every(line => visibleWidth(line) <= width));
  }
});

test("Unicode and ANSI output stay inside narrow terminal widths", () => {
  for (const width of [1, 2, 8, 20, 80]) {
    const { lines } = render('printf "שלום 世界"', "שלום 世界\n\x1b[31mred diagnostic\x1b[0m", { width });
    assert.ok(lines.every(line => visibleWidth(line) <= width), `Every rendered row must fit width ${width}`);
  }
});

test("oversized JSON stays complete and skips syntax highlighting", () => {
  for (const payload of ["x".repeat(210000), "א".repeat(110000)]) {
    const output = JSON.stringify({ payload, enabled: true }, null, 2);
    const { lines, result, plain } = render("large JSON", output, { expanded: true });
    assert.equal(result.content[0].text, output, "The display must not change large model-facing output");
    assert.match(plain, /"enabled": true/, "Expanded output must retain the final field");
    const row = lines.find(line => stripVTControlCharacters(line).includes('"enabled"'));
    assert.ok(colorCount(row) <= 2, "Oversized JSON must use plain output colors");
  }
});

test("the 200 KiB JSON boundary retains syntax colors", () => {
  const empty = JSON.stringify({ payload: "", enabled: true }, null, 2);
  const output = JSON.stringify({ payload: "x".repeat(200 * 1024 - Buffer.byteLength(empty)), enabled: true }, null, 2);
  assert.equal(Buffer.byteLength(output), 200 * 1024);
  const { lines } = render("JSON boundary", output);
  const row = lines.find(line => stripVTControlCharacters(line).includes('"enabled"'));
  assert.ok(colorCount(row) >= 3, "JSON exactly at 200 KiB must still get syntax colors");
});

test("live timers stop at completion and interruption", (context) => {
  context.mock.timers.enable({ apis: ["setInterval", "Date"] });
  let redraws = 0;
  const component = new ToolExecutionComponent("bash", "live", { command: "long command" }, {}, definition, { requestRender() { redraws++; } }, process.cwd());
  component.markExecutionStarted();
  const started = redraws;
  context.mock.timers.tick(2000);
  assert.equal(redraws - started, 2, "A running call must update elapsed time");
  handlers.get("agent_end")();
  const interrupted = redraws;
  component.invalidate();
  context.mock.timers.tick(2000);
  assert.equal(redraws, interrupted, "An interrupted call must not keep or restart its timer");
  const second = new ToolExecutionComponent("bash", "finished", { command: "short command" }, {}, definition, { requestRender() { redraws++; } }, process.cwd());
  second.markExecutionStarted();
  second.updateResult({ content: [{ type: "text", text: "done" }], details: undefined, isError: false });
  const finished = redraws;
  context.mock.timers.tick(2000);
  assert.equal(redraws, finished, "Completed calls must release their timers");
  handlers.get("session_shutdown")();
});

test("pretty-bash owns only its renderer, not execution or other tools", () => {
  const other = { renderShell: "default" };
  assert.equal(resolver("read", () => other), other);
  const chosen = resolver("bash", () => ({ renderShell: "default", renderCall() { throw new Error("wrong renderer"); } }));
  assert.equal(chosen.renderShell, "self", "Rich Bash must own its box layout instead of inheriting another renderer's shell");
  assert.equal(chosen.execute, undefined);
  assert.equal(chosen.parameters, undefined);
});

for (const ownerFirst of [true, false]) {
  test(`real Pi keeps the customized Bash tool (ownerFirst=${ownerFirst})`, async () => {
    const directory = mkdtempSync(join(tmpdir(), "pretty-bash-owner-"));
    const original = createBashToolDefinition(directory);
    const owned = { ...original, parameters: { ...original.parameters, properties: { ...original.parameters.properties, forceFull: { type: "boolean" } } } };
    const owner = pi => pi.registerTool(owned);
    const settingsManager = SettingsManager.inMemory({});
    const loader = new DefaultResourceLoader({ cwd: directory, agentDir: directory, settingsManager, noExtensions: true, noSkills: true, noThemes: true, noContextFiles: true, noPromptTemplates: true, extensionFactories: ownerFirst ? [owner, prettyBash] : [prettyBash, owner] });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, [], "Renderer and execution owner must coexist without diagnostics");
    const { session } = await createAgentSession({ cwd: directory, resourceLoader: loader, settingsManager, sessionManager: SessionManager.inMemory(directory) });
    try {
      assert.equal(session.getToolDefinition("bash"), owned, "The complete customized tool definition must remain with its owner");
      const bash = session.agent.state.tools.find(tool => tool.name === "bash");
      const result = await bash.execute("real-bash", { command: 'printf "%s" "$PI_SESSION_ID"', forceFull: true });
      assert.equal(result.structuredContent.output, session.sessionManager.getSessionId(), "Execution must preserve Pi session metadata");
      const drawing = session.extensionRunner.resolveToolRenderers("bash", () => owned);
      const component = new ToolExecutionComponent("bash", "real-bash", { command: "session identity" }, { showImages: false }, drawing, { requestRender() {} }, directory);
      component.updateResult({ ...result, isError: false });
      assert.match(component.render(80).map(stripVTControlCharacters).join("\n"), /┌─ ✓/, "The independently registered renderer must draw the actual result");
    } finally {
      session.dispose();
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
