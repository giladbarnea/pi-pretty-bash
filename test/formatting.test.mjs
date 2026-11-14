import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { createAgentSession, createBashToolDefinition, DefaultResourceLoader, initTheme, SessionManager, SettingsManager, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { visibleWidth } from "@earendil-works/pi-tui";
import prettyBash from "../index.ts";

initTheme("dark", false);
const native = createBashToolDefinition(process.cwd());
let resolver;
prettyBash({ registerToolRenderer: callback => { resolver = callback; }, on() {} });
const definition = { ...native, ...resolver("bash", () => native) };

function render(command, width = 120) {
  const input = Object.freeze({ command });
  const component = new ToolExecutionComponent("bash", "formatting", input, { showImages: false }, definition, { requestRender() {} }, process.cwd());
  component.setExpanded(true);
  const plain = component.render(width).map(stripVTControlCharacters).join("\n");
  const source = plain.split("\n").filter(line => /^│\s+\d+ /.test(line)).map(line => line.replace(/^│\s+\d+ /, "").replace(/\s+│\s*$/, "")).join("\n");
  return { component, input, plain, source };
}

test("condensed command chains become numbered, formatted Bash without changing arguments", () => {
  const command = 'name="Ada";printf "%s\\n" "$name";echo done';
  const { input, source } = render(command);
  assert.equal(source, 'name="Ada"\nprintf "%s\\n" "$name"\necho done', "The input box must show separate shfmt-formatted statements");
  assert.equal(input.command, command, "The agent's exact command must remain the execution and transcript input");
});

for (const [name, command, expected] of [
  ["subshell and pipeline", '(cd /tmp;printf one|sort -u);echo done', '(\n  cd /tmp\n  printf one | sort -u\n)\necho done'],
  ["Bash arrays and conditions", 'values=(one two);for value in "${values[@]}";do [[ $value == o* ]]&&printf "%s\\n" "$value";done', 'values=(one two)\nfor value in "${values[@]}"; do [[ $value == o* ]] && printf "%s\\n" "$value"; done'],
  ["comment and quoted heredoc", "# Preserve this comment\ncat<<'EOF'|sort\n  first  value\nsecond value\nEOF\necho done", "# Preserve this comment\ncat << 'EOF' | sort\n  first  value\nsecond value\nEOF\necho done"],
  ["tab-stripping heredoc", "cat<<-'EOF'\n\tkept\n\tEOF\necho done", "cat <<- 'EOF'\n   kept\n   EOF\necho done"],
]) {
  test(`formats ${name} while preserving quoted source and comments`, () => {
    assert.equal(render(command).source, expected, `Unexpected formatted ${name}`);
  });
}

for (const command of ['if  true;then', 'printf "%s', 'echo ready &&', "cat <<'EOF'\nunterminated"]) {
  test(`unparseable Bash remains as written: ${command.split("\n")[0]}`, () => {
    const { source, plain, input } = render(command);
    if (command.includes("\n")) assert.equal(source, command, "Incomplete multiline code must remain complete, not be discarded");
    else assert.ok(plain.includes(`● Bash ${command}`), `Expected original command in header, got ${plain}`);
    assert.equal(input.command, command);
  });
}

test("partial argument updates recover from invalid to valid Bash without changing the command", () => {
  const { component } = render('if  true;then');
  const input = Object.freeze({ command: 'echo one;echo two' });
  component.updateArgs(input);
  const plain = component.render(120).map(stripVTControlCharacters).join("\n");
  assert.match(plain, /│\s+1 echo one\s+│/);
  assert.match(plain, /│\s+2 echo two\s+│/);
  assert.equal(input.command, 'echo one;echo two');
});

for (const width of [40, 80, 120]) {
  test(`collapse toggles use formatted lines, not the original condensed line (width=${width})`, () => {
    const command = Array.from({ length: 30 }, (_, index) => `echo item-${index + 1}`).join(";");
    const { component, input } = render(command, width);
    for (const expanded of [false, true, false]) {
      component.setExpanded(expanded);
      const lines = component.render(width);
      const plain = lines.map(stripVTControlCharacters).join("\n");
      const numbers = [...plain.matchAll(/│\s+\d+ echo item-(\d+)\s+│/g)].map(match => Number(match[1]));
      assert.deepEqual(numbers, expanded ? Array.from({ length: 30 }, (_, index) => index + 1) : [1, 2, 3, 4, 5, 26, 27, 28, 29, 30]);
      assert.equal(plain.includes("20 more lines"), !expanded);
      assert.ok(lines.every(line => visibleWidth(line) <= width));
    }
    assert.equal(input.command, command);
  });
}

test("real Bash executes the original source lines and model-facing output stays unchanged", async () => {
  const command = 'printf "%s\\n" "$LINENO";printf "%s\\n" "$LINENO"';
  const { component, input } = render(command);
  const result = await native.execute("original-source", input, undefined, undefined, { cwd: process.cwd(), sessionManager: SessionManager.inMemory(process.cwd()) });
  assert.match(result.content[0].text, /^(\d+)\n\1\n$/, "Both statements execute on the same original line, not on different formatted lines");
  const before = structuredClone(result);
  component.updateResult({ ...result, isError: false });
  component.render(120);
  assert.deepEqual(result, before, "Rendering may not change model-facing output or structured content");
});

test("Pi's actual extension loader resolves the bundled formatter without a system shfmt", async () => {
  const directory = mkdtempSync(join(tmpdir(), "pretty-bash-format-loader-"));
  try {
    const loader = new DefaultResourceLoader({ cwd: directory, agentDir: directory, settingsManager: SettingsManager.inMemory({}), additionalExtensionPaths: [join(import.meta.dirname, "../index.ts")], noExtensions: true, noSkills: true, noThemes: true, noContextFiles: true, noPromptTemplates: true });
    await loader.reload();
    const loaded = loader.getExtensions();
    assert.deepEqual(loaded.errors, [], "The CJS/jiti extension path must resolve and initialize the WASM dependency");
    assert.equal(loaded.extensions.length, 1, "The formatter extension must actually load, not be skipped");
    const { session } = await createAgentSession({ cwd: directory, resourceLoader: loader, settingsManager: SettingsManager.inMemory({}), sessionManager: SessionManager.inMemory(directory) });
    try {
      const drawing = session.extensionRunner.resolveToolRenderers("bash", () => native);
      for (const command of ['echo one;echo two', 'if  true;then']) {
        const component = new ToolExecutionComponent("bash", "loaded-formatter", { command }, {}, drawing, { requestRender() {} }, directory);
        const plain = component.render(120).map(stripVTControlCharacters).join("\n");
        if (command.startsWith("if")) assert.ok(plain.includes(`● Bash ${command}`), "Parse fallback must also keep the rich Bash renderer through jiti");
        else assert.match(plain, /│\s+2 echo two\s+│/, "The installed-path renderer must really format its command");
      }
    } finally {
      session.dispose();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
