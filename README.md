<div align="center">

# pi-pretty-bash

> **Bash tool calls should look like Bash.**

[![pi extension](https://img.shields.io/badge/pi-extension-blueviolet)](https://github.com/earendil-works/pi)
[![npm version](https://img.shields.io/npm/v/%40giladbarnea%2Fpi-pretty-bash?logo=npm)](https://www.npmjs.com/package/@giladbarnea/pi-pretty-bash)
[![license](https://img.shields.io/github/license/giladbarnea/pi-pretty-bash)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

`pi-pretty-bash` adds theme-aware syntax colors to Bash tool calls and JSON output in Pi's TUI.

</div>

<p align="center">
  <img src="screenshots/1.png" alt="A syntax-highlighted Bash tool call in Pi" width="760">
</p>

## Install

```sh
pi install npm:@giladbarnea/pi-pretty-bash
```

Start a new Pi session, or run `/reload` in the current session. Every later Bash tool call is highlighted automatically.

## Bash commands and JSON output get syntax colors

The extension starts from Pi's complete built-in Bash definition. It highlights the visible command with Pi's Bash colors.

After a command finishes, the extension checks its complete output with `JSON.parse()`. Valid JSON gets Pi's JSON colors without reformatting. All other output keeps Pi's built-in rendering.

Pi still owns command execution, streaming output, timing, truncation, expansion, and error display.

## Compatibility

`pi-pretty-bash` requires Pi `0.83.0` or newer.

## License

[MIT](LICENSE)
