import {
  createBashToolDefinition,
  highlightCode,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

export default function prettyBash(pi: ExtensionAPI): void {
  const bashTool = createBashToolDefinition(process.cwd());
  const renderBashCall = bashTool.renderCall;

  if (!renderBashCall) {
    throw new Error("Pi's Bash tool has no call renderer");
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
  });
}
