---
last_updated: 2026-11-01T20-50
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

Start a new Pi session, or run `/reload` in the current session. Every later Bash tool call is highlighted automatically.

## Rich Bash layout without replacing the Bash tool

Short commands get syntax colors in the header. Multiline commands get numbered boxes, and long commands wrap without losing their end. Result boxes show status, elapsed time and line counts. Collapsed results show ten visual tail rows; expansion shows the complete returned text.

The Bash palette preserves the former personal `bash-rich-highlight` choices, including function colors for built-ins. It uses `cli-highlight` with Pi theme colors, not the former HTML parser or hardcoded installation paths.

Complete valid JSON up to 200 KiB gets Pi's JSON colors without reformatting. Larger JSON, partial output and unrecognized formats stay plain. Rendering never cuts or changes the result sent to the model. Failure captions use Pi's error flag, not text that merely resembles an exit-status message.

The extension uses `registerToolRenderer()` without replacing Bash parameters or execution. Timers stop when calls finish, the agent run ends or the session shuts down.

## Compatibility

`pi-pretty-bash` targets Pi `1.4.*`. Other extensions can own the Bash tool and add parameters without changing this rendering. If another extension also draws Bash, load pretty-bash first to select this display. Broader terminal-layout extensions may still style the surrounding tool block.

## License

[MIT](LICENSE)
