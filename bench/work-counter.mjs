// Counts the renderer's native work at its WASM boundaries: shfmt `format` calls and tree-sitter parses and queries.
// Import this module before index.ts, so shfmt's WASM instance is created through the counting constructor.
import { Parser, Query } from "web-tree-sitter";

export const work = { formats: 0, parses: 0, queries: 0 };

/** Reset the counters and return the work done since the previous reset. */
export function takeWork() {
  const taken = { ...work };
  Object.assign(work, { formats: 0, parses: 0, queries: 0 });
  return taken;
}

function counted(counter, call) {
  return function (...args) {
    work[counter]++;
    return call.apply(this, args);
  };
}

const OriginalInstance = WebAssembly.Instance;
WebAssembly.Instance = new Proxy(OriginalInstance, {
  construct(target, args) {
    const instance = Reflect.construct(target, args);
    if (typeof instance.exports.format !== "function" || typeof instance.exports.get_formatted_text !== "function") return instance;
    const exports = { ...instance.exports, format: counted("formats", instance.exports.format) };
    return new Proxy(instance, { get: (object, key) => key === "exports" ? exports : Reflect.get(object, key) });
  },
});
Parser.prototype.parse = counted("parses", Parser.prototype.parse);
Query.prototype.captures = counted("queries", Query.prototype.captures);
