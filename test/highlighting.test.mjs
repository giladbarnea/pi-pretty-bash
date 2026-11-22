import assert from "node:assert/strict";
import { after, test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { highlightCode, initTheme } from "@earendil-works/pi-coding-agent";
import { createBashHighlighter } from "../highlighting.js";

initTheme("dark", false);
const packageRoot = new URL("./", import.meta.resolve("@earendil-works/pi-coding-agent"));
const { theme } = await import(new URL("modes/interactive/theme/theme.js", packageRoot).href);
const highlighter = await createBashHighlighter(highlightCode);
after(highlighter.dispose);

test("source at the size limit is colored; one character more is returned complete and plain", () => {
  const boundary = "#" + "x".repeat(16_383);
  const colored = highlighter.highlight(boundary, theme);
  assert.notEqual(colored, boundary, "Source at the size limit must still receive colors");
  assert.equal(stripVTControlCharacters(colored), boundary);
  const oversized = boundary + "שלום 🚀";
  assert.ok(highlighter.highlight(oversized, theme) === oversized, "Oversized source must be returned unchanged, without spending work on colors");
});

for (const [name, source] of [
  ["deep substitutions", "echo " + "$(echo ".repeat(1000) + "x" + ")".repeat(1000)],
  ["long pipelines", Array(2000).fill("true").join(" | ")],
]) {
  test(`expensive ${name} decline colors and leave later calls healthy`, () => {
    const normal = highlighter.highlight("git show --stat", theme);
    for (let redraw = 0; redraw < 3; redraw++) {
      const result = highlighter.highlight(source, theme);
      assert.ok(result === source, `${name} must stop optional coloring and retain all source`);
      assert.equal(highlighter.highlight("git show --stat", theme), normal, "An interrupted parse must not resume against another command");
    }
  });
}

test("redraws follow theme changes and recreated highlighters agree", async () => {
  const source = "git show --stat | grep -c '\\.ts$'\ncat <<'PY'\nprint(True)\nPY";
  const normal = highlighter.highlight(source, theme);
  const reloaded = await createBashHighlighter(highlightCode);
  try {
    assert.equal(reloaded.highlight(source, theme), normal, "A recreated highlighter must draw identically");
    initTheme("light", false);
    const light = reloaded.highlight(source, theme);
    assert.notEqual(light, normal, "Theme changes must not reuse old colors");
    assert.equal(stripVTControlCharacters(light), source);
    assert.ok(light.includes(highlightCode("print(True)", "python").join("\n")), "Embedded colors must follow the current theme");
  } finally {
    initTheme("dark", false);
    reloaded.dispose();
  }
});

test("disposed highlighters return plain source and tolerate repeated disposal", async () => {
  const retiring = await createBashHighlighter(highlightCode);
  const source = "git status && printf done";
  assert.notEqual(retiring.highlight(source, theme), source, "The fixture must have colors before disposal");
  retiring.dispose();
  assert.equal(retiring.highlight(source, theme), source, "Late draws must be complete and plain");
  assert.doesNotThrow(() => retiring.dispose(), "Repeated shutdown must not free resources twice");
});

test("embedded work has one cumulative input budget; bodies beyond it keep Bash string colors", async () => {
  let embeddedLength = 0;
  const bounded = await createBashHighlighter((source, language) => {
    embeddedLength += source.length;
    return highlightCode(source, language);
  });
  const bashBodyLine = theme.fg("syntaxString", "print(True)");
  const bashBodyLines = result => result.split("\n").filter(line => line === bashBodyLine).length;
  try {
    const largeBody = "print(True)\n".repeat(400);
    const smallerBody = "print(True)\n".repeat(200);
    for (const [source, injected, bashLines] of [
      [`cat <<'PY'\n${largeBody}PY`, 0, 400],
      [`cat <<'PY'\n${largeBody}`, 0, 400],
      [`cat <<'PY'\n${smallerBody}PY\ncat <<'PY'\n${smallerBody}PY`, smallerBody.length, 200],
    ]) {
      embeddedLength = 0;
      const result = bounded.highlight(source, theme);
      assert.equal(embeddedLength, injected, "The host highlighter must receive only bodies that fit the 4096-character budget");
      assert.equal(bashBodyLines(result), bashLines, "Bodies beyond the budget must keep their Bash string colors");
      assert.equal(stripVTControlCharacters(result), source);
    }
  } finally {
    bounded.dispose();
  }
});

test("an embedded body at the cumulative limit gets its language; one character more keeps Bash colors", () => {
  const body = "#" + "x".repeat(4094) + "\n";
  const source = `cat <<'PY'\n${body}PY`;
  assert.ok(highlighter.highlight(source, theme).includes(highlightCode(body, "python").join("\n")), "An embedded body at the cumulative limit gets Python colors");
  const overBudget = `cat <<'PY'\n${body}x\nPY`;
  const result = highlighter.highlight(overBudget, theme);
  assert.equal(result.split("\n")[2], theme.fg("syntaxString", "x"), "The first character beyond the embedded limit must leave the body to Bash colors");
  assert.equal(stripVTControlCharacters(result), overBudget);
});

test("the streaming reparse shares the work bound", () => {
  const source = "true | ".repeat(1000) + "cat <<'PY'\nimport json";
  const normal = highlighter.highlight("git show --stat", theme);
  for (let redraw = 0; redraw < 3; redraw++) {
    assert.ok(highlighter.highlight(source, theme) === source, "An expensive open heredoc must stop optional coloring and retain all source");
    assert.equal(highlighter.highlight("git show --stat", theme), normal, "An interrupted parse must not resume against another command");
  }
});

test("quoted PY labels select Python colors regardless of the command", () => {
  const body = 'import json\nprint(json.dumps({"enabled": True}))';
  const source = `uv run python3 - <<'PY'\n${body}\nPY`;
  const result = highlighter.highlight(source, theme);
  assert.ok(result.includes(highlightCode(body, "python").join("\n")), "A literal Python heredoc must not be painted as one Bash string");
  assert.equal(stripVTControlCharacters(result), source, "Embedded syntax colors must preserve the entire command");
  const data = `echo python3 <<'PY'\n${body}\nPY`;
  assert.ok(highlighter.highlight(data, theme).includes(highlightCode(body, "python").join("\n")), "The label declares Python text even when echo does not execute it");
});

test("quoted language labels select the declared language, not the interpreter", () => {
  const examples = [
    ["PY", "python", "enabled = True"], ["PYTHON", "python", "enabled = True"], ["PYEOF", "python", "enabled = True"],
    ["JS", "javascript", "const enabled = true;"], ["JAVASCRIPT", "javascript", "const enabled = true;"],
    ["NODE", "javascript", "const enabled = true;"], ["JXA", "javascript", "const enabled = true;"],
    ["TS", "typescript", "const enabled: boolean = true;"], ["JSON", "json", '{"enabled": true}'],
    ["PATCH", "diff", "-old\n+new"], ["DIFF", "diff", "-old\n+new"], ["RUBY", "ruby", "puts :enabled"],
  ];
  for (const [label, language, body] of examples) {
    const expected = highlightCode(body, language).join("\n");
    assert.notEqual(expected, theme.fg("syntaxString", body), `The fixture for ${language} must differ from a Bash string`);
    for (const quote of ["'", '"']) {
      const source = `python3 -m json.tool <<${quote}${label}${quote}\n${body}\n${label}`;
      const result = highlighter.highlight(source, theme);
      assert.ok(result.includes(expected), `${quote}${label}${quote} must select ${language}`);
      assert.equal(stripVTControlCharacters(result), source);
    }
  }
});

test("unknown and unquoted heredocs retain Bash string colors", () => {
  const body = "import json";
  for (const delimiter of ["'EOF'", '"EOF"', "PY", "JSON"]) {
    const source = `python3 - <<${delimiter}\n${body}\n${delimiter.replace(/['"]/g, "")}`;
    const result = highlighter.highlight(source, theme);
    assert.equal(result.split("\n")[1], theme.fg("syntaxString", body), `${delimiter} must not inject a language`);
    assert.equal(stripVTControlCharacters(result), source);
  }
});

test("streamed bodies get their declared colors before the terminator arrives", () => {
  const header = "cat <<'PY'\n";
  const body = 'import json\nprint("שלום 🚀")\n';
  const source = header + body + "PY\nprintf after";
  for (let length = 0; length <= source.length; length++) {
    const prefix = source.slice(0, length);
    const result = highlighter.highlight(prefix, theme);
    assert.equal(stripVTControlCharacters(result), prefix, `Source changed at prefix ${length}`);
    if (length <= header.length || length > header.length + body.length) continue;
    const expected = highlightCode(prefix.slice(header.length), "python").join("\n");
    assert.ok(result.includes(expected), `Python body is missing at prefix ${length}: ${JSON.stringify(prefix)}`);
  }
});

test("every prefix preserves source around pipes, lists, substitutions and multiple heredocs", () => {
  const body = 'import json\nprint("שלום 🚀")\n';
  const json = '{"enabled": true}\n';
  const tabbedBody = '\timport json\n\tprint("שלום 🚀")\n';
  const indentedBody = '\n  import json\nprint("שלום 🚀")\n';
  const fixtures = [
    { source: `printf '🚀'; cat <<'PY'\n${body}PY\nprintf after`, bodies: [[body, "python"]] },
    { source: `cat <<'PY' | head\n${body}PY\nprintf after`, bodies: [[body, "python"]] },
    { source: `cat <<'PY' && echo done\n${body}PY\nprintf after`, bodies: [[body, "python"]] },
    { source: `output=$(cat <<'PY'\n${body}PY\n)\nprintf after`, bodies: [[body, "python"]] },
    { source: `cat <<-'PY'\n${tabbedBody}\tPY\nprintf after`, bodies: [[tabbedBody, "python"]] },
    { source: `cat <<'PY'\n${indentedBody}PY\nprintf after`, bodies: [[indentedBody, "python"]] },
    { source: `cat <<'PY'\n${body}PY\ncat <<'JSON'\n${json}JSON\nprintf after`, bodies: [[body, "python"], [json, "json"]] },
    { source: `cat <<'PY' <<'JSON'\n${body}PY\n${json}JSON`, bodies: [[body, "python"]] },
    { source: `cat <<'PY' "$(cat <<'JSON'\n${json}JSON\n)"\n${body}PY\nprintf after`, bodies: [] },
    { source: `cat <<'PY' | python3 - <<'JS'\n${body}PY\nconsole.log(1)\nJS\nprintf after`, bodies: [] },
  ];
  for (const { source, bodies } of fixtures) {
    for (let length = 0; length <= source.length; length++) {
      const prefix = source.slice(0, length);
      const result = highlighter.highlight(prefix, theme);
      assert.equal(stripVTControlCharacters(result), prefix, `Source changed: ${JSON.stringify(prefix)}`);
      for (const [text, language] of bodies) {
        const start = source.indexOf(text);
        if (length <= start) continue;
        const present = source.slice(start, Math.min(length, start + text.length));
        assert.ok(result.includes(highlightCode(present, language).join("\n")), `${language} colors missing: ${JSON.stringify(prefix)}`);
      }
    }
    if (!source.endsWith("printf after") || bodies.length === 0) continue;
    assert.equal(highlighter.highlight(source, theme).split("\n").at(-1), highlighter.highlight("printf after", theme), "Following commands keep Bash colors");
  }
});

test("body lines that merely start with the label are body text, not terminators", () => {
  const fixtures = [
    ["node <<'JS'\n", "JSON.stringify({a: true});\nconsole.log(1);\n", "JS\nprintf after", "javascript"],
    ["cat <<'PY'\n", "PYTHONPATH = '/tmp'\nprint(PYTHONPATH)\n", "PY\nprintf after", "python"],
    ["cat <<'PY'\n", "import os\nPYTHONPATH = os.environ['HOME']\nprint(True)\n", "PY\nprintf after", "python"],
    ["cat <<'PY'\n", "x = 1\nPY = 2\nPY_x = 3\nprint(PY)\n", "PY\nprintf after", "python"],
  ];
  for (const [header, body, tail, language] of fixtures) {
    const source = header + body + tail;
    const result = highlighter.highlight(source, theme);
    assert.equal(stripVTControlCharacters(result), source);
    assert.ok(result.includes(highlightCode(body, language).join("\n")), `The whole body must get ${language} colors: ${JSON.stringify(source)}`);
    assert.equal(result.split("\n").at(-1), highlighter.highlight("printf after", theme), `The command after the real terminator keeps Bash colors: ${JSON.stringify(source)}`);
  }
});

test("<<- bodies end at the tab-indented terminator, not at a label-prefixed line", () => {
  const body = "\tx = 1\n\tPYTHON = 2\n\tprint(x)\n";
  const source = `cat <<-'PY'\n${body}\tPY\nprintf after`;
  const result = highlighter.highlight(source, theme);
  assert.equal(stripVTControlCharacters(result), source);
  assert.ok(result.includes(highlightCode(body, "python").join("\n")), "The tab-stripped body must get Python colors through its last line");
  assert.equal(result.split("\n").at(-1), highlighter.highlight("printf after", theme), "The command after the real terminator keeps Bash colors");
});

test("unterminated streaming bodies with label-prefixed lines stay in their language at every prefix", () => {
  for (const [header, body, language] of [
    ["cat <<'PY'\n", "import os\nPYTHONPATH = os.environ['HOME']\nprint(True)\n", "python"],
    ["node <<'JS'\n", "JSON.stringify({a: true});\nconsole.log(1);\n", "javascript"],
  ]) {
    const source = header + body;
    for (let length = header.length + 1; length <= source.length; length++) {
      const prefix = source.slice(0, length);
      const result = highlighter.highlight(prefix, theme);
      assert.equal(stripVTControlCharacters(result), prefix, `Source changed at prefix ${length}`);
      // A last line that is exactly the label is, so far, a valid terminator.
      if (/\n(PY|JS)$/.test(prefix)) continue;
      assert.ok(result.includes(highlightCode(prefix.slice(header.length), language).join("\n")), `${language} body is missing at prefix ${length}: ${JSON.stringify(prefix)}`);
    }
  }
});

test("indented label lines are body text unless <<- strips their leading tabs", () => {
  const fixtures = [
    ["cat <<'PY'\n", "value = 1\n  PY\nvalue = True\n", "PY\nprintf after"],
    ["cat <<'PY'\n", "value = 1\n\tPY\nvalue = True\n", "PY\nprintf after"],
    ["cat <<-'PY'\n", "\tvalue = 1\n  PY\n\tvalue = True\n", "\tPY\nprintf after"],
    ["cat <<-'PY'\n", "\tvalue = 1\n\t  PY\n\tvalue = True\n", "PY\nprintf after"],
  ];
  for (const [header, body, tail] of fixtures) {
    const source = header + body + tail;
    const result = highlighter.highlight(source, theme);
    assert.equal(stripVTControlCharacters(result), source);
    assert.ok(result.includes(highlightCode(body, "python").join("\n")), `The whole body must get Python colors: ${JSON.stringify(source)}`);
    assert.equal(result.split("\n").at(-1), highlighter.highlight("printf after", theme), `The command after the real terminator keeps Bash colors: ${JSON.stringify(source)}`);
  }
});

test("unterminated streaming bodies with indented label lines stay in their language at every prefix", () => {
  for (const header of ["cat <<'PY'\n", "cat <<-'PY'\n"]) {
    const source = `${header}value = 1\n  PY\n\t  PY\nvalue = True\n`;
    for (let length = header.length + 1; length <= source.length; length++) {
      const prefix = source.slice(0, length);
      const result = highlighter.highlight(prefix, theme);
      assert.equal(stripVTControlCharacters(result), prefix, `Source changed at prefix ${length}`);
      // A last line that is exactly the label is, so far, a valid terminator.
      if (/\nPY$/.test(prefix)) continue;
      assert.ok(result.includes(highlightCode(prefix.slice(header.length), "python").join("\n")), `Python body is missing at prefix ${length}: ${JSON.stringify(prefix)}`);
    }
  }
});
