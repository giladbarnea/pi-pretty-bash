---
last_updated: 2026-11-02T23-18
---

# Bundled highlighting assets

`assets/tree-sitter-bash.wasm` comes from `tree-sitter-bash` 0.25.1, licensed under MIT. Its SHA-256 is `8292919c88a0f7d3fb31d0cd0253ca5a9531bc1ede82b0537f2c63dd8abe6a7a`. The complete license is in `licenses/tree-sitter-bash.txt`.

`assets/bash.scm` derives from the [nvim-treesitter Bash highlights query](https://github.com/nvim-treesitter/nvim-treesitter/blob/f47f549f74cea5d5f25a5205c9e127cd882f1d20/runtime/queries/bash/highlights.scm), licensed under Apache-2.0. The November 2, 2026 source snapshot has SHA-256 `a4e5e1afa7656c3275629467170362997a7b36f51405b0fc0e6c0be080693acd`. Changes replace Lua-match predicates with JavaScript-match predicates and add flags, subcommands, launchers, assignment targets, globs and redirection captures. The complete license is in `licenses/nvim-treesitter.txt`.

The separately installed `web-tree-sitter` 0.27.1 runtime is MIT-licensed. There is no native compilation or install script for the bundled grammar.
