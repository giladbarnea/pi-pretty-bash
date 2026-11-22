export type BashTheme = {
  fg(color: "syntaxFunction" | "syntaxKeyword" | "syntaxType" | "syntaxString" | "syntaxVariable" | "syntaxOperator" | "syntaxComment" | "syntaxNumber" | "syntaxPunctuation", text: string): string;
  bold(text: string): string;
  italic(text: string): string;
};

export type BashHighlighter = {
  highlight(source: string, theme: BashTheme): string;
  dispose(): void;
};

export type HighlightCode = (source: string, language: string) => string[];

export const MAX_SOURCE_LENGTH: number;

export function createBashHighlighter(highlightCode: HighlightCode): Promise<BashHighlighter>;
