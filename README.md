---
last_updated: 2026-11-22T11-40
---

<div align="center">

# pi-pretty-bash

> **Bash tool calls should look like Bash.**

[![pi extension](https://img.shields.io/badge/pi-extension-blueviolet)](https://github.com/earendil-works/pi)
[![npm version](https://img.shields.io/npm/v/%40giladbarnea%2Fpi-pretty-bash?logo=npm)](https://www.npmjs.com/package/@giladbarnea/pi-pretty-bash)
[![license](https://img.shields.io/github/license/giladbarnea/pi-pretty-bash)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

`pi-pretty-bash` gives Bash commands and results a compact boxed display with theme-aware syntax colors.

</div>

## Install

```sh
pi install npm:@giladbarnea/pi-pretty-bash
```

Alternatively, install from Git with `pi install git:github.com/giladbarnea/pi-pretty-bash`, or use `pi install /path/to/pi-pretty-bash` for development. Enable only one copy, then start a new Pi session or run `/reload`.

## Rich Bash layout without replacing the Bash tool

Dense Bash gets readable spacing and indentation from [shfmt](https://github.com/mvdan/sh), bundled through dprint with no system binary needed. Only the display is formatted. Execution and model context keep the original command. Unparseable input stays as written.

Short commands get syntax colors in the header. Multiline formatted commands get numbered boxes, and long commands wrap without losing their end. Boxes paint no background, so the terminal background shows through. Result boxes show status, elapsed time and line counts. Pi's tool expansion toggle governs both boxes. Collapsed, a command box over ten rows shows its first and last five, and results show ten visual tail rows; expansion shows the complete command and returned text.

Commands are parsed with [tree-sitter-bash](https://github.com/tree-sitter/tree-sitter-bash) and colored with Pi theme colors: command names, subcommands, flags, strings, variables, operators and redirections each get their own color. A quoted heredoc delimiter names its body's language, like a Markdown fence: `'PY'`, `'JS'`, `'TS'`, `'JSON'`, `'DIFF'`, `'RUBY'` and a few aliases get that language's colors from Pi's own highlighter, even while the command is still streaming. Other delimiters such as `'EOF'` keep string colors. Commands over 16 KiB, or too expensive to parse, stay complete in plain text; heredoc bodies beyond 4 KiB per command keep string colors.

Complete valid JSON up to 200 KiB gets Pi's JSON colors without reformatting. Larger JSON, partial output and unrecognized formats stay plain. Rendering never cuts or changes the result sent to the model. Failure captions use Pi's error flag, not text that merely resembles an exit-status message.

Source-provided terminal formatting and control characters are removed before display. The renderer then applies its own colors; tool results and programmatic data remain unchanged.

The extension uses `registerToolRenderer()` without replacing Bash parameters or execution. Timers stop when calls finish, the agent run ends or the session shuts down.

## Compatibility

`pi-pretty-bash` supports Pi `1.4.*` and `1.5.*`. Other extensions can own the Bash tool and add parameters without changing this rendering. If another extension also draws Bash, load pretty-bash first to select this display. Broader terminal-layout extensions may still style the surrounding tool block.

## License

[MIT](LICENSE)
