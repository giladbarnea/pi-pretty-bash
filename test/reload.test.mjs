import assert from "node:assert/strict";
import { test } from "node:test";
import { highlightCode, initTheme } from "@earendil-works/pi-coding-agent";

const tables = [];
const OriginalTable = WebAssembly.Table;
WebAssembly.Table = new Proxy(OriginalTable, { construct(target, args) { const table = Reflect.construct(target, args); tables.push(table); return table; } });

initTheme("dark", false);
const packageRoot = new URL("./", import.meta.resolve("@earendil-works/pi-coding-agent"));
const { theme } = await import(new URL("modes/interactive/theme/theme.js", packageRoot).href);

test("reloading the extension module reuses the loaded grammar instead of growing WASM state", async () => {
  // Pi re-evaluates extension modules on /reload; a fresh query string does the same here.
  const sizes = [];
  let previous;
  for (let reload = 0; reload < 5; reload++) {
    const { createBashHighlighter } = await import(`../highlighting.js?reload=${reload}`);
    const highlighter = await createBashHighlighter(highlightCode);
    const drawn = highlighter.highlight("git show --stat", theme);
    if (previous !== undefined) assert.equal(drawn, previous, "Reloaded highlighters must draw identically");
    previous = drawn;
    highlighter.dispose();
    sizes.push(tables.map(table => table.length).join(","));
  }
  assert.ok(tables.length > 0, "The fixture must observe the WASM function table");
  assert.deepEqual(sizes, Array(sizes.length).fill(sizes[0]), `WASM table sizes must stay flat across reloads: ${sizes.join(" → ")}`);
});
