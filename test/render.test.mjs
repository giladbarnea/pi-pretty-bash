import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createBashToolDefinition,
  initTheme,
  ToolExecutionComponent,
} from "@earendil-works/pi-coding-agent";
import prettyBash from "../index.ts";

initTheme("dark");

const ui = { requestRender() {} };
let prettyBashTool;
prettyBash({ registerTool: (tool) => (prettyBashTool = tool) });
/** Pi's built-in Bash result rendering under the extension's own call header, so only result rendering differs. */
const builtinBash = { ...createBashToolDefinition(process.cwd()), renderCall: prettyBashTool.renderCall };

const jsonOutputs = {
  "single-line JSON": '{"enabled":true}',
  "multi-line JSON": JSON.stringify({ a: 1, b: [1, 2, 3], c: { d: "e" }, f: "g", h: null, i: 2 }, null, 2),
  "wrapping JSON": JSON.stringify({ key: "x".repeat(150) }),
};

const layouts = [false, true].flatMap((expanded) =>
  [0, 1].flatMap((outputPad) => [40, 80].map((width) => ({ expanded, outputPad, width }))),
);

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, "").replace(/\x1b\][^\x07]*\x07/g, "");
}

/** Renders a finished Bash result through Pi's transcript component, the same path the TUI uses. */
function renderBashResult(definition, output, { expanded, outputPad, width }) {
  const component = new ToolExecutionComponent(
    "bash",
    "tool-call-id",
    { command: "cat result.json" },
    { outputPad, showImages: false },
    definition,
    ui,
    "/",
  );
  component.setExpanded(expanded);
  component.updateResult(
    { content: [{ type: "text", text: output }], details: undefined, isError: false, durationMs: 1200 },
    false,
  );
  return component.render(width);
}

for (const [name, output] of Object.entries(jsonOutputs)) {
  for (const layout of layouts) {
    test(`${name} keeps Pi's Bash layout with JSON colors (${JSON.stringify(layout)})`, () => {
      const builtinLines = renderBashResult(builtinBash, output, layout);
      const prettyLines = renderBashResult(prettyBashTool, output, layout);

      assert.deepEqual(
        prettyLines.map(stripAnsi),
        builtinLines.map(stripAnsi),
        "Expected the same visible text as Pi's built-in Bash renderer: no duplicated, dropped, or moved lines.",
      );

      assert.notDeepEqual(prettyLines, builtinLines, "Expected JSON colors to differ from Pi's plain Bash output colors.");
    });
  }
}

test("non-JSON output renders exactly like Pi's built-in Bash renderer", () => {
  for (const layout of layouts) {
    assert.deepEqual(
      renderBashResult(prettyBashTool, "hello\nworld", layout),
      renderBashResult(builtinBash, "hello\nworld", layout),
      `Expected identical rendering for ${JSON.stringify(layout)}.`,
    );
  }
});
