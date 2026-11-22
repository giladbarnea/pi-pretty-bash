// A long Pi session's Bash calls, rendered through Pi's ToolExecutionComponent exactly as the interactive transcript does.
import { createBashToolDefinition, initTheme, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import prettyBash from "../index.ts";

const python = Array.from({ length: 40 }, (_, index) => `    total += values[${index}] * ${index}  # weight ${index}`).join("\n");
const javascript = Array.from({ length: 30 }, (_, index) => `  PY${index}: { "id": ${index}, "label": "item ${index}" },`).join("\n");

/** Bash commands in the proportions of a working session: short calls, pipelines, loops and long labelled heredocs.
 * @example sessionCommands(3).length // 3
 */
export function sessionCommands(count) {
  const shapes = [
    index => `git status --short && git --no-pager log --oneline -${index % 9 + 1}`,
    index => `rg -n "pattern${index}" src/ | sort | uniq -c | head -20`,
    index => `for file in src/*.ts; do\n  printf '%s\\n' "$file" >> /tmp/list-${index}\ndone`,
    index => `cat > /tmp/script-${index}.py <<'PY'\nimport sys\nvalues = list(range(40))\ntotal = 0\nfor index in range(40):\n${python}\nprint(total, file=sys.stderr)\nPY\npython3 /tmp/script-${index}.py`,
    index => `node <<'JS'\nconst table = {\n${javascript}\n};\nconsole.log(Object.keys(table).length + ${index});\nJS`,
    index => `if [[ -f "$HOME/.config/app-${index}" ]]; then\n\tcat <<-'PY'\n\tprint("nested ${index}")\n\tPY\nfi`,
    index => `MODE=test env timeout 30 bash -c 'echo "$MODE" | tr a-z A-Z' ; echo "exit=$?" # case ${index}`,
  ];
  return Array.from({ length: count }, (_, index) => shapes[index % shapes.length](index));
}

/** Mount finished Bash calls with their results, as a resumed session shows them. */
export async function mountSession(commands, { width = 120, expanded = false, themeName = "dark" } = {}) {
  initTheme(themeName, false);
  const native = createBashToolDefinition(process.cwd());
  let resolver;
  await prettyBash({ registerToolRenderer: registered => { resolver = registered; }, on() {} });
  const definition = { ...native, ...resolver("bash", () => native) };
  const ui = { requestRender() {} };
  const components = commands.map((command, index) => {
    const component = new ToolExecutionComponent("bash", `call-${index}`, { command }, { showImages: false }, definition, ui, process.cwd());
    component.setExpanded(expanded);
    component.markExecutionStarted();
    component.setArgsComplete();
    component.updateResult({ content: [{ type: "text", text: `ok ${index}\n` }], isError: false, durationMs: 1200 }, false);
    return component;
  });
  /** Draw one frame after a transcript-wide invalidation (theme change, Ctrl+O, terminal colors), as Pi's TUI.invalidate() does. */
  const frame = () => components.flatMap(component => { component.invalidate(); return component.render(width); });
  return { components, frame };
}
