import {
  createBashToolDefinition,
  highlightCode,
  truncateToVisualLines,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

const BASH_PREVIEW_LINES = 5;

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
  const bashTool = createBashToolDefinition(process.cwd());
  const renderBashCall = bashTool.renderCall;
  const renderBashResult = bashTool.renderResult;

  if (!renderBashCall) {
    throw new Error("Pi's Bash tool has no call renderer");
  }
  if (!renderBashResult) {
    throw new Error("Pi's Bash tool has no result renderer");
  }

  pi.registerTool({
    ...bashTool,

    renderCall(arguments_, theme, context) {
      const component = renderBashCall(arguments_, theme, context);
      if (!("setText" in component) || typeof component.setText !== "function") {
        throw new Error("Pi's Bash call renderer no longer returns mutable text");
      }

      const command = typeof arguments_.command === "string" ? arguments_.command : "";
      const renderedCommand = command
        ? highlightCode(command, "bash").join("\n")
        : theme.fg("toolOutput", "...");
      const timeout =
        typeof arguments_.timeout === "number"
          ? theme.fg("muted", ` (timeout ${arguments_.timeout}s)`)
          : "";

      component.setText(`${theme.fg("toolTitle", theme.bold("$"))} ${renderedCommand}${timeout}`);
      return component;
    },

    renderResult(result, options, theme, context) {
      const component = renderBashResult(result, options, theme, context);
      const output = result.content
        .map((content) => (content.type === "text" ? content.text : ""))
        .join("\n")
        .trim();
      const shouldHighlight =
        !options.isPartial && !result.details?.truncation?.truncated && isJson(output);

      if (!shouldHighlight) {
        return component;
      }
      if (!hasChildren(component) || !component.children[0]) {
        throw new Error("Pi's Bash result renderer no longer exposes its output component");
      }

      const outputComponent = component.children[0];
      const renderOutput = outputComponent.render.bind(outputComponent);
      const highlightedOutput = highlightCode(output, "json").join("\n");
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
  });
}
