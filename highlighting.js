// @ts-check
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Language, Parser, Query } from "web-tree-sitter";

/** @typedef {import('./highlighting.d.ts').BashTheme} Theme */
/** @typedef {import('./highlighting.d.ts').BashHighlighter} BashHighlighter */
/** @typedef {import('./highlighting.d.ts').HighlightCode} HighlightCode */
/** @typedef {{start: number, end: number, pattern: number, style: number}} Span */

// Cooperative work limits, not a wall-clock deadline. Past the source or work limit the source is returned uncolored;
// labelled heredoc bodies past the embedded limit keep their Bash string colors.
export const MAX_SOURCE_LENGTH = 16_384;
const MAX_WORK_CHECKS = 256;
const MAX_EMBEDDED_LENGTH = 4096;

// A quoted heredoc delimiter declares its body's language, like a Markdown fence; the command is never consulted.
/** @type {ReadonlyMap<string, string>} */
const HEREDOC_LANGUAGES = new Map([
  ['PY', 'python'], ['PYTHON', 'python'], ['PYEOF', 'python'],
  ['JS', 'javascript'], ['JAVASCRIPT', 'javascript'], ['NODE', 'javascript'], ['JXA', 'javascript'],
  ['TS', 'typescript'], ['JSON', 'json'], ['PATCH', 'diff'], ['DIFF', 'diff'], ['RUBY', 'ruby'],
]);

/** @type {Record<string, number>} */
const CAPTURE_STYLES = {
  function: 1, subcommand: 2, keyword: 3, label: 3, option: 4,
  string: 5, heredoc: 5, variable: 6, constant: 6, assign: 6,
  operator: 7, redirect: 7, comment: 8, number: 9, glob: 9,
  'variable.parameter': 0, 'string.special': 0, 'string.special.path': 0,
  'punctuation.bracket': 10, 'punctuation.delimiter': 7,
  'punctuation.special': 6, 'character.special': 6, 'keyword.directive': 8,
  none: 0,
};
/** @type {ReadonlyArray<{color: Parameters<Theme['fg']>[0], bold?: boolean, italic?: boolean} | null>} */
const STYLES = [
  null, { color: 'syntaxFunction', bold: true }, { color: 'syntaxFunction' },
  { color: 'syntaxKeyword' }, { color: 'syntaxType' }, { color: 'syntaxString' },
  { color: 'syntaxVariable' }, { color: 'syntaxOperator', bold: true },
  { color: 'syntaxComment', italic: true }, { color: 'syntaxNumber' },
  { color: 'syntaxPunctuation' },
];

// WASM grammars cannot be unloaded, and Pi re-evaluates extension modules on every /reload.
// One grammar per web-tree-sitter runtime (keyed by its Language class) keeps reloads from leaking.
/** @type {WeakMap<typeof Language, Promise<Language>>} */
const grammars = /** @type {Record<symbol, WeakMap<typeof Language, Promise<Language>> | undefined>} */ (/** @type {unknown} */ (globalThis))[Symbol.for('pi-pretty-bash.grammars')] ??= new WeakMap();

/** Load the Bash grammar once per web-tree-sitter runtime.
 * @returns {Promise<Language>}
 * @example await loadGrammar() === await loadGrammar()
 */
function loadGrammar() {
  const cached = grammars.get(Language) ?? Parser.init().then(() => Language.load(fileURLToPath(new URL('./assets/tree-sitter-bash.wasm', import.meta.url))));
  grammars.set(Language, cached);
  return cached;
}

/** Read an explicitly quoted language label.
 * @param {string} delimiter
 * @returns {string | undefined}
 * @example heredocLabel("'PY'") === 'PY'
 */
function heredocLabel(delimiter) {
  return /^(['"])([A-Z]+)\1$/.exec(delimiter)?.[2];
}

/** Whether a line ends a heredoc: Bash requires the whole line to be the delimiter; `<<-` first strips leading tabs, never spaces.
 * @param {string} line
 * @param {string} delimiter
 * @param {boolean} stripsTabs
 * @returns {boolean}
 * @example isTerminator('\tPY', 'PY', true) === true && isTerminator('  PY', 'PY', true) === false && isTerminator('\tPY', 'PY', false) === false
 */
function isTerminator(line, delimiter, stripsTabs) {
  return (stripsTabs ? line.replace(/^\t+/, '') : line) === delimiter;
}

/** Map a query capture to a style index; unknown authored captures fail at startup.
 * @param {string} name
 * @returns {number | undefined}
 * @example captureStyle('variable.parameter') === 0
 */
function captureStyle(name) {
  if (name.startsWith('_') || name === 'spell' || name === 'nospell') return undefined;
  const style = CAPTURE_STYLES[name] ?? CAPTURE_STYLES[name.split('.')[0]];
  if (style === undefined) throw new Error(`Unknown Bash highlight capture: ${name}`);
  return style;
}

/** Paint runs of equal style without changing visible text or carrying styles across lines.
 * @param {string} source
 * @param {Uint8Array} owners
 * @param {Theme} theme
 * @returns {string}
 * @example paint('echo', new Uint8Array(4), theme) === 'echo'
 */
function paint(source, owners, theme) {
  let output = '';
  for (let start = 0; start < source.length;) {
    let end = start + 1;
    while (end < source.length && owners[end] === owners[start] && source[end] !== '\n' && source[start] !== '\n') end++;
    const text = source.slice(start, end);
    const style = STYLES[owners[start]];
    const colored = style && text !== '\n' ? theme.fg(style.color, text) : text;
    output += style?.bold ? theme.bold(colored) : style?.italic ? theme.italic(colored) : colored;
    start = end;
  }
  return output;
}

/** Initialize a synchronous, theme-aware Bash highlighter. Callers supply already-sanitized display text
 * and the host's code highlighter for labelled heredoc bodies, so no second Pi runtime is imported.
 * @param {HighlightCode} highlightCode
 * @returns {Promise<BashHighlighter>}
 * @example const highlighter = await createBashHighlighter(highlightCode); highlighter.highlight('git status', theme);
 */
export async function createBashHighlighter(highlightCode) {
  const language = await loadGrammar();
  const query = new Query(language, readFileSync(new URL('./assets/bash.scm', import.meta.url), 'utf8'));
  const captureStyles = new Map(query.captureNames.map(name => [name, captureStyle(name)]));
  const parser = new Parser().setLanguage(language);
  let disposed = false;
  return {
    highlight(source, theme) {
      if (disposed || source.length > MAX_SOURCE_LENGTH) return source;
      let remaining = MAX_WORK_CHECKS;
      const options = { progressCallback: () => --remaining <= 0 };
      // Only the tree uses the parsed text; painting reads the original source at the same offsets.
      let text = source;
      let closed = false;
      let tree = parser.parse(text, null, options);
      try {
        for (;;) {
          if (!tree) return source;
          // tree-sitter-bash ends a heredoc at any line that starts with its delimiter, even indented (JSON under 'JS', '  PY');
          // a terminator must be the whole line, so mask the false one, same length, and parse again.
          const falseEnd = tree.rootNode.descendantsOfType('heredoc_end').find(node => {
            const lineEnd = text.indexOf('\n', node.endIndex);
            const line = text.slice(text.lastIndexOf('\n', node.startIndex - 1) + 1, lineEnd < 0 ? text.length : lineEnd);
            return !isTerminator(line, node.text, node.parent?.children.some(child => child?.type === '<<-') ?? false);
          });
          // A streaming heredoc has no terminator yet; close it synthetically so its body parses as it will when complete.
          const open = closed ? undefined : tree.rootNode.descendantsOfType('heredoc_start').find(node => node.parent?.type !== 'heredoc_redirect');
          const openLabel = open && heredocLabel(open.text);
          if (!falseEnd && !(openLabel && HEREDOC_LANGUAGES.has(openLabel))) break;
          const masked = falseEnd && falseEnd.endIndex - falseEnd.text.trimStart().length;
          text = masked === undefined ? `${text}\n${openLabel}\n` : `${text.slice(0, masked)}\x7f${text.slice(masked + 1)}`;
          closed ||= masked === undefined;
          tree.delete();
          tree = parser.parse(text, null, options);
        }
        const captures = query.captures(tree.rootNode, options);
        if (remaining <= 0) return source;
        /** @type {Span[]} */
        const spans = [];
        for (const capture of captures) {
          const style = captureStyles.get(capture.name);
          if (style === undefined) continue;
          spans.push({ start: capture.node.startIndex, end: capture.node.endIndex, pattern: capture.patternIndex, style });
        }
        spans.sort((left, right) => (right.end - right.start) - (left.end - left.start) || left.pattern - right.pattern);
        const owners = new Uint8Array(source.length);
        for (const span of spans) owners.fill(span.style, span.start, span.end);
        let output = '';
        let position = 0;
        let embeddedLength = 0;
        for (const redirect of tree.rootNode.descendantsOfType('heredoc_redirect')) {
          const start = redirect.namedChildren.find(node => node?.type === 'heredoc_start');
          const body = redirect.namedChildren.find(node => node?.type === 'heredoc_body');
          const label = start && heredocLabel(start.text);
          const language = label && HEREDOC_LANGUAGES.get(label);
          if (!body || !language || body.startIndex < position || body.startIndex >= source.length) continue;
          const end = Math.min(body.endIndex, source.length);
          if (embeddedLength + end - body.startIndex > MAX_EMBEDDED_LENGTH) continue;
          embeddedLength += end - body.startIndex;
          output += paint(source.slice(position, body.startIndex), owners.subarray(position, body.startIndex), theme);
          output += highlightCode(source.slice(body.startIndex, end), language).join('\n');
          position = end;
        }
        return output + paint(source.slice(position), owners.subarray(position), theme);
      } finally {
        tree?.delete();
        parser.reset();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      query.delete();
      parser.delete();
    },
  };
}
