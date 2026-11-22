import assert from "node:assert/strict";
import { test } from "node:test";
import { createBashToolDefinition, initTheme, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import prettyBash from "../index.ts";

const native = createBashToolDefinition(process.cwd());
let resolver;
await prettyBash({ registerToolRenderer: callback => { resolver = callback; }, on() {} });
const renderers = resolver("bash", () => native);
let callComponent;
let resultComponent;
let drawingTheme;
const definition = {
  ...native,
  ...renderers,
  renderCall: (...args) => { drawingTheme = args[1]; callComponent = renderers.renderCall(...args); return callComponent; },
  renderResult: (...args) => { resultComponent = renderers.renderResult(...args); return resultComponent; },
};

/** List every SGR parameter that sets a background: 40-47, 100-107, or an extended 48 color.
 * @example backgroundCodes("\x1b[38;5;252m\x1b[48;5;16mhi") // ["48;5;16"]
 */
function backgroundCodes(line) {
  const codes = [];
  for (const match of line.matchAll(/\x1b\[([\d;]*)m/g)) {
    const parameters = (match[1] || "0").split(";").map(Number);
    for (let index = 0; index < parameters.length; index += 1) {
      const code = parameters[index];
      if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) codes.push(String(code));
      if (code !== 38 && code !== 48) continue;
      const length = parameters[index + 1] === 2 ? 5 : 3;
      if (code === 48) codes.push(parameters.slice(index, index + length).join(";"));
      index += length - 1;
    }
  }
  return codes;
}

/** Fail with the offending row when a row paints any background. */
function assertTransparent(lines, surface) {
  for (const line of lines) {
    assert.deepEqual(backgroundCodes(line), [], `${surface} must leave the terminal background showing: ${JSON.stringify(line)}`);
  }
}

for (const theme of ["dark", "light"]) {
  for (const width of [1, 2, 8, 20, 40, 80, 120]) {
    test(`input and output boxes paint no background through wrapping and toggles (${theme}, width=${width})`, () => {
      initTheme(theme, false);
      const command = Array.from({ length: 24 }, (_, index) => `printf 'שלום 世界 ${index} a long highlighted string\\n'`).join("\n");
      const output = JSON.stringify({ status: "ready", records: Array.from({ length: 24 }, (_, index) => ({ index, enabled: true })) }, null, 2);
      const component = new ToolExecutionComponent("bash", "background", { command }, { showImages: false }, definition, { requestRender() {} }, process.cwd());
      const result = { content: [{ type: "text", text: output }], details: undefined, isError: false, durationMs: 1200 };
      component.updateResult(result);
      for (const expanded of [false, true, false]) {
        component.setExpanded(expanded);
        const rows = component.render(width);
        assert.ok(rows.every(line => visibleWidth(line) <= width));
        assertTransparent(callComponent.render(width), "Bash input");
        assertTransparent(resultComponent.render(width), "Bash output");
      }
      assert.equal(result.content[0].text, output, "Rendering must not change tool-result data");
    });
  }

  test(`compact, wrapped single-line and empty input paint no background (${theme})`, () => {
    initTheme(theme, false);
    for (const command of ["git status --short", "git ".repeat(100), ""]) {
      const component = new ToolExecutionComponent("bash", "compact-background", { command }, {}, definition, { requestRender() {} }, process.cwd());
      component.updateResult({ content: [{ type: "text", text: "" }], details: undefined, isError: false });
      component.render(40);
      assertTransparent(callComponent.render(40), "Bash input");
      assertTransparent(resultComponent.render(40), "Bash output");
    }
  });

  test(`a transparent input box keeps its theme colors and its one-column right margin (${theme})`, () => {
    initTheme(theme, false);
    const component = new ToolExecutionComponent("bash", "colors", { command: "printf 'one'\necho \"$HOME\"" }, {}, definition, { requestRender() {} }, process.cwd());
    component.render(40);
    const lines = callComponent.render(40);
    const joined = lines.join("\n");
    for (const token of ["borderMuted", "syntaxString", "syntaxVariable", "muted"]) {
      assert.ok(joined.includes(drawingTheme.getFgAnsi(token)), `Input must still use the theme's ${token} color`);
    }
    const borders = lines.slice(1).map(line => line.replace(/\x1b\[[\d;]*m/g, ""));
    assert.deepEqual(borders.map(line => [visibleWidth(line), line.at(-1)]), [[39, "┐"], [39, "│"], [39, "│"], [39, "┘"]], "The box ends one column inside the width, as before");
  });
}
