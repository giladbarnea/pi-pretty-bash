import assert from "node:assert/strict";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";
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

/** Builds a finished Bash result through Pi's real transcript component. */
function createBashResult(definition, output, { expanded, outputPad }) {
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
  const result = { content: [{ type: "text", text: output }], details: undefined, isError: false, durationMs: 1200 };
  component.updateResult(result, false);
  return { component, result };
}

function renderBashResult(definition, output, layout) {
  return createBashResult(definition, output, layout).component.render(layout.width);
}

function measureBashRendering(definition, output, layout) {
  const started = performance.now();
  const { component, result } = createBashResult(definition, output, layout);
  const lines = component.render(layout.width);
  const initialMilliseconds = performance.now() - started;
  const framesStarted = performance.now();
  for (let frame = 0; frame < 20; frame += 1) component.render(layout.width);
  const frameMilliseconds = (performance.now() - framesStarted) / 20;
  return { component, result, lines, initialMilliseconds, frameMilliseconds };
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

test("oversized JSON keeps complete output and uses Pi's native result rendering", () => {
  const outputs = [
    JSON.stringify({ payload: "x".repeat(200 * 1024) }),
    JSON.stringify({ payload: "x".repeat(1100000) }),
    JSON.stringify({ payload: "א".repeat(110000) }),
    `${" ".repeat(200 * 1024)}{"enabled":true}`,
    `{"enabled":true}${" ".repeat(200 * 1024)}`,
  ];
  for (const output of outputs) {
    for (const expanded of [false, true]) {
      const layout = { expanded, outputPad: 1, width: 80 };
      const { component, result } = createBashResult(prettyBashTool, output, layout);
      assert.ok(isDeepStrictEqual(component.render(layout.width), renderBashResult(builtinBash, output, layout)),
        "JSON above 200 KiB must use native rendering rather than expensive highlighting");
      assert.equal(result.content[0].text, output, "Rendering must not cut or mutate the complete tool result");
    }
  }
});

test("JSON exactly at 200 KiB keeps its syntax colors and visible output", () => {
  const output = JSON.stringify({ payload: "x".repeat(200 * 1024 - '{"payload":""}'.length) });
  assert.equal(Buffer.byteLength(output), 200 * 1024, "The fixture must exercise the exact highlighting boundary");
  for (const expanded of [false, true]) {
    const layout = { expanded, outputPad: 1, width: 80 };
    const native = renderBashResult(builtinBash, output, layout);
    const pretty = renderBashResult(prettyBashTool, output, layout);
    assert.ok(!isDeepStrictEqual(pretty, native), "JSON at the boundary must still be highlighted");
    assert.deepEqual(pretty.map(stripAnsi), native.map(stripAnsi), "Highlighting must leave the visible output unchanged");
  }
});

for (const count of [10000, 40000]) {
  for (const expanded of [false, true]) {
    test(`oversized JSON rendering stays near native cost (${count} items, expanded=${expanded})`, () => {
      const output = JSON.stringify(Array.from({ length: count }, (_, index) => ({
        id: index, name: `item-${index}`, enabled: index % 2 === 0, tags: ["a", "b"],
      })), null, 2);
      const layout = { expanded, outputPad: 1, width: 120 };
      const native = measureBashRendering(builtinBash, output, layout);
      const pretty = measureBashRendering(prettyBashTool, output, layout);
      assert.ok(isDeepStrictEqual(pretty.lines, native.lines), "Oversized JSON must use the native renderer");
      assert.equal(pretty.result.content[0].text, output, "The complete tool output must remain unchanged");
      assert.ok(pretty.initialMilliseconds <= native.initialMilliseconds * 3 + 100,
        `Initial rendering must stay near native cost: pretty=${pretty.initialMilliseconds.toFixed(1)}ms, native=${native.initialMilliseconds.toFixed(1)}ms`);
      assert.ok(pretty.frameMilliseconds <= native.frameMilliseconds * 3 + 8,
        `Oversized-result frames must stay near native cost: pretty=${pretty.frameMilliseconds.toFixed(1)}ms, native=${native.frameMilliseconds.toFixed(1)}ms`);
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
