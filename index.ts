import {
  createBashToolDefinition,
  highlightCode,
  truncateToVisualLines,
  type BashToolDetails,
  type ExtensionAPI,
  type ToolRenderers,
} from "@earendil-works/pi-coding-agent";

const BASH_PREVIEW_LINES = 5;
const JSON_HIGHLIGHT_MAX_BYTES = 200 * 1024;

interface RenderComponent {
  render(width: number): string[];
}

interface ComponentContainer extends RenderComponent {
  children: RenderComponent[];
}

function hasChildren(component: RenderComponent): component is ComponentContainer {
  return "children" in component && Array.isArray(component.children);
}

/**
 * @example isJson('{"enabled":true}') // true
 */
function isJson(output: string): boolean {
  try {
    const parsed: unknown = JSON.parse(output);
    return JSON.stringify(parsed) !== undefined;
  } catch {
    return false;
  }
}

export default function prettyBash(pi: ExtensionAPI): void {
  const bashTool = createBashToolDefinition(process.cwd()) as ToolRenderers;
  const renderBashCall = bashTool.renderCall;
  const renderBashResult = bashTool.renderResult;

  if (!renderBashCall) {
    throw new Error("Pi's Bash tool has no call renderer");
  }
  if (!renderBashResult) {
    throw new Error("Pi's Bash tool has no result renderer");
  }

  const renderers: ToolRenderers = {
    renderCall(arguments_, theme, context) {
      const component = renderBashCall(arguments_, theme, context);
      if (!("setText" in component) || typeof component.setText !== "function") {
        throw new Error("Pi's Bash call renderer no longer returns mutable text");
      }

      const callArguments = arguments_ as Record<string, unknown>;
      const command = typeof callArguments.command === "string" ? callArguments.command : "";
      const renderedCommand = command
        ? highlightCode(command, "bash").join("\n")
        : theme.fg("toolOutput", "...");
      const timeout =
        typeof callArguments.timeout === "number"
          ? theme.fg("muted", ` (timeout ${callArguments.timeout}s)`)
          : "";

      component.setText(`${theme.fg("toolTitle", theme.bold("$"))} ${renderedCommand}${timeout}`);
      return component;
    },

    renderResult(result, options, theme, context) {
      const component = renderBashResult(result, options, theme, context);
      const output = result.content
        .map((content) => (content.type === "text" ? content.text : ""))
        .join("\n");
      const details = result.details as BashToolDetails | undefined;
      const shouldHighlight =
        !options.isPartial &&
        !details?.truncation?.truncated &&
        output.length <= JSON_HIGHLIGHT_MAX_BYTES &&
        Buffer.byteLength(output, "utf8") <= JSON_HIGHLIGHT_MAX_BYTES &&
        isJson(output);

      if (!shouldHighlight) {
        return component;
      }
      // Pi renders expanded output as one component, and collapsed output as a spacer followed by its preview.
      const outputIndex = options.expanded ? 0 : 1;
      if (!hasChildren(component) || !component.children[outputIndex]) {
        throw new Error("Pi's Bash result renderer no longer exposes its output component");
      }

      const outputComponent = component.children[outputIndex];
      const renderOutput = outputComponent.render.bind(outputComponent);
      const highlightedOutput = highlightCode(output.trim(), "json").join("\n");
      const maxVisualLines = options.expanded ? Number.POSITIVE_INFINITY : BASH_PREVIEW_LINES;

      outputComponent.render = (width) => {
        const originalLines = renderOutput(width);
        const highlightedLines = truncateToVisualLines(
          highlightedOutput,
          maxVisualLines,
          width,
        ).visualLines;
        const preservedLineCount = originalLines.length - highlightedLines.length;

        if (preservedLineCount < 0) {
          throw new Error("Pi's Bash result layout changed while highlighting JSON output");
        }

        return [...originalLines.slice(0, preservedLineCount), ...highlightedLines];
      };

      return component;
    },
  };

  pi.registerToolRenderer((toolName, next) =>
    toolName === "bash" ? { ...next(), ...renderers } : next(),
  );
}
