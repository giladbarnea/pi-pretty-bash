import assert from "node:assert/strict";
import { test } from "node:test";
import { createBashToolDefinition, initTheme, Theme, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { colorToHex, visibleWidth } from "@earendil-works/pi-tui";
import prettyBash from "../index.ts";

const native = createBashToolDefinition(process.cwd());
let resolver;
prettyBash({ registerToolRenderer: callback => { resolver = callback; }, on() {} });
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

/** Interpret SGR per visible terminal cell, including resets inside highlighted text. */
function terminalCells(line) {
  const cells = [];
  let foreground = "default";
  let background = "default";
  for (const match of line.matchAll(/\x1b\[([\d;]*)m|([^\x1b]+)/g)) {
    if (match[2] !== undefined) {
      for (const character of match[2]) {
        for (let column = 0; column < visibleWidth(character); column += 1) cells.push({ foreground, background });
      }
      continue;
    }
    const parameters = (match[1] || "0").split(";").map(Number);
    for (let index = 0; index < parameters.length; index += 1) {
      const code = parameters[index];
      if (code === 0) { foreground = "default"; background = "default"; }
      if (code === 39) foreground = "default";
      if (code === 49) background = "default";
      if (code !== 38 && code !== 48) continue;
      const count = parameters[index + 1] === 2 ? 3 : 1;
      const color = `${parameters[index + 1]}:${parameters.slice(index + 2, index + 2 + count).join(",")}`;
      if (code === 38) foreground = color;
      else background = color;
      index += count + 1;
    }
  }
  return { cells, background, foreground };
}

const isBlack = color => color === "5:16" || color === "2:0,0,0";

test("Pi's compound faint-token resets cannot hide subsequent unhighlighted input", () => {
  initTheme("light", false);
  new ToolExecutionComponent("bash", "theme", { command: "true" }, {}, definition, { requestRender() {} }, process.cwd());
  const colors = Object.fromEntries(Object.entries(drawingTheme.colors).map(([token, color]) => [token, colorToHex(color)]));
  const faintTheme = new Theme(colors, {}, drawingTheme.getColorMode(), { appearance: "light", dim: ["syntaxString"] });
  const input = renderers.renderCall({ command: 'printf "highlighted"; external-command' }, faintTheme, { state: {}, executionStarted: false, isPartial: false, expanded: false });
  const lines = input.render(80);
  assert.ok(lines.some(line => line.includes("\x1b[22;39m")), "The fixture must exercise Pi's real faint-token foreground reset");
  for (const line of lines) {
    assert.ok(terminalCells(line).cells.every(cell => cell.foreground !== "default"), "Text after a faint syntax token must not return to a light terminal's black default foreground");
  }
});

for (const theme of ["dark", "light"]) {
  for (const width of [1, 2, 8, 20, 40, 80, 120]) {
    test(`only input has a full-width black surface through wrapping and toggles (${theme}, width=${width})`, () => {
      initTheme(theme, false);
      const command = Array.from({ length: 24 }, (_, index) => `printf 'שלום 世界 ${index} a long highlighted string\\n'`).join(";");
      const output = JSON.stringify({ status: "ready", records: Array.from({ length: 24 }, (_, index) => ({ index, enabled: true })) }, null, 2);
      const component = new ToolExecutionComponent("bash", "background", { command }, { showImages: false }, definition, { requestRender() {} }, process.cwd());
      const result = { content: [{ type: "text", text: output }], details: undefined, isError: false, durationMs: 1200 };
      component.updateResult(result);
      for (const expanded of [false, true, false]) {
        component.setExpanded(expanded);
        assert.ok(component.render(width).every(line => visibleWidth(line) <= width));
        for (const line of callComponent.render(width)) {
          const rendered = terminalCells(line);
          assert.equal(rendered.cells.length, width, "Every input row must fill the available width");
          assert.ok(rendered.cells.every(cell => isBlack(cell.background)), `Every input cell, including borders, padding and hint rows, must be black: ${JSON.stringify(line)}`);
          assert.equal(rendered.background, "default", "Input background must not bleed into the next row");
        }
        for (const line of resultComponent.render(width)) {
          assert.ok(terminalCells(line).cells.every(cell => !isBlack(cell.background)), "Output keeps the terminal background so it stays distinct from input");
        }
      }
      assert.equal(result.content[0].text, output, "Background styling must not change tool-result data");
    });
  }

  test(`compact, wrapped single-line and empty input also use black without invisible default text (${theme})`, () => {
    initTheme(theme, false);
    for (const command of ["git status --short", "git ".repeat(100), ""]) {
      const component = new ToolExecutionComponent("bash", "compact-background", { command }, {}, definition, { requestRender() {} }, process.cwd());
      component.updateResult({ content: [{ type: "text", text: "" }], details: undefined, isError: false });
      component.render(40);
      for (const line of callComponent.render(40)) {
        const { cells, background } = terminalCells(line);
        assert.equal(cells.length, 40);
        assert.ok(cells.every(cell => isBlack(cell.background)));
        assert.ok(cells.every(cell => cell.foreground !== "default" && !isBlack(cell.foreground)), "Unhighlighted text must stay visible even in a light terminal with a black default foreground");
        assert.equal(background, "default");
      }
    }
  });
}
