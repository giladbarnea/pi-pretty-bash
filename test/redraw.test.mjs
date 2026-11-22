import assert from "node:assert/strict";
import { test } from "node:test";
import { takeWork } from "../bench/work-counter.mjs";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { mountSession, sessionCommands } from "../bench/session.mjs";

const PAST_CALLS = 200;
const packageRoot = new URL("./", import.meta.resolve("@earendil-works/pi-coding-agent"));
const { loadAllHighlightLanguages } = await import(new URL("utils/syntax-highlight.js", packageRoot).href);

test("past calls recolor heredoc bodies whose grammar Pi loads after the first draw", async () => {
  // Pi draws a resumed transcript before loading its deferred grammars (diff among them), then redraws everything.
  const patch = ["git apply <<'PATCH'\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\nPATCH"];
  const session = await mountSession(patch, { expanded: true });
  const beforeLoad = session.frame();
  await loadAllHighlightLanguages();
  const fresh = (await mountSession(patch, { expanded: true })).frame();
  assert.notDeepEqual(fresh, beforeLoad, "The fixture must draw the PATCH body differently once diff is loaded");
  assert.deepEqual(session.frame(), fresh, "After the deferred grammars load, a redraw must match a fresh render");
});

test("redrawing a long session does not re-format or re-highlight its past Bash calls", async () => {
  const { frame } = await mountSession(sessionCommands(PAST_CALLS));
  frame();
  takeWork();
  frame();
  const redraw = takeWork();
  // Generous: any per-frame work that scales with past calls lands far above this.
  assert.ok(redraw.formats + redraw.parses + redraw.queries <= 5, `A redraw of ${PAST_CALLS} past calls must not repeat their formatting or highlighting: ${JSON.stringify(redraw)}`);
});

test("redrawn past calls match a fresh render, and a theme change recolors them", async () => {
  const session = await mountSession(sessionCommands(14));
  session.frame();
  const darkRedraw = session.frame();
  assert.deepEqual(darkRedraw, (await mountSession(sessionCommands(14))).frame(), "A redraw must draw exactly what a fresh render draws");
  initTheme("light", false);
  const lightRedraw = session.frame();
  assert.notDeepEqual(lightRedraw, darkRedraw, "The fixture's themes must draw differently");
  assert.deepEqual(lightRedraw, (await mountSession(sessionCommands(14), { themeName: "light" })).frame(), "After a theme change, a redraw must use the new theme's colors");
});
