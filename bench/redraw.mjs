// Per-frame cost of redrawing a session's past Bash calls. Run from the repository root: node bench/redraw.mjs
import { takeWork } from "./work-counter.mjs";
import { VERSION } from "@earendil-works/pi-coding-agent";
import { mountSession, sessionCommands } from "./session.mjs";

const FRAMES = 5;
const rows = [];
for (const count of [10, 50, 200]) {
  const { frame } = await mountSession(sessionCommands(count));
  takeWork();
  const durations = [];
  let perFrame;
  for (let index = 0; index < FRAMES; index++) {
    const startedAt = performance.now();
    frame();
    durations.push(performance.now() - startedAt);
    perFrame = takeWork();
  }
  const median = [...durations].sort((left, right) => left - right)[Math.floor(FRAMES / 2)];
  rows.push({
    "past calls": count,
    "frame ms (median)": Number(median.toFixed(2)),
    "shfmt formats/frame": perFrame.formats,
    "tree-sitter parses/frame": perFrame.parses,
    "tree-sitter queries/frame": perFrame.queries,
  });
}
console.log(`Pi ${VERSION}, Node ${process.version}`);
console.table(rows);
