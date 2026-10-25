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
const nativeBash = createBashToolDefinition(process.cwd());
let rendererResolver;
prettyBash({ registerToolRenderer: (resolver) => (rendererResolver = resolver) });
const prettyBashTool = { ...nativeBash, ...rendererResolver("bash", () => nativeBash) };
/** Pi's built-in Bash result rendering under the extension's own call header, so only result rendering differs. */
const builtinBash = { ...nativeBash, renderCall: prettyBashTool.renderCall };

test("pretty Bash registers renderers without taking ownership of the Bash tool", () => {
  const tools = [];
  const resolvers = [];
  prettyBash({
    registerTool: (definition) => tools.push(definition),
    registerToolRenderer: (resolver) => resolvers.push(resolver),
  });
  assert.equal(tools.length, 0, "Visual rendering must not replace another extension's Bash parameters or execution");
  assert.equal(resolvers.length, 1, "The extension must use Pi's renderer resolver API");
  const otherRenderers = { renderShell: "self" };
  assert.equal(resolvers[0]("read", () => otherRenderers), otherRenderers,
    "Other tools' renderers must pass through unchanged");
});

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
