import {
  createScanner,
  LanguageVariant,
  SyntaxKind,
} from "typescript/unstable/ast";

// Slash is contextual: rescanning every slash would hide code between divisions.
const expressionStarts = new Set([
  SyntaxKind.OpenParenToken,
  SyntaxKind.OpenBracketToken,
  SyntaxKind.OpenBraceToken,
  SyntaxKind.CommaToken,
  SyntaxKind.ColonToken,
  SyntaxKind.SemicolonToken,
  SyntaxKind.QuestionToken,
  SyntaxKind.QuestionQuestionToken,
  SyntaxKind.EqualsGreaterThanToken,
  SyntaxKind.ExclamationToken,
  SyntaxKind.TildeToken,
  SyntaxKind.PlusToken,
  SyntaxKind.MinusToken,
  SyntaxKind.AsteriskToken,
  SyntaxKind.AsteriskAsteriskToken,
  SyntaxKind.SlashToken,
  SyntaxKind.PercentToken,
  SyntaxKind.AmpersandToken,
  SyntaxKind.BarToken,
  SyntaxKind.CaretToken,
  SyntaxKind.AmpersandAmpersandToken,
  SyntaxKind.BarBarToken,
  SyntaxKind.EqualsEqualsToken,
  SyntaxKind.EqualsEqualsEqualsToken,
  SyntaxKind.ExclamationEqualsToken,
  SyntaxKind.ExclamationEqualsEqualsToken,
  SyntaxKind.ReturnKeyword,
  SyntaxKind.ThrowKeyword,
  SyntaxKind.CaseKeyword,
  SyntaxKind.YieldKeyword,
  SyntaxKind.AwaitKeyword,
  SyntaxKind.DeleteKeyword,
  SyntaxKind.TypeOfKeyword,
  SyntaxKind.VoidKeyword,
  SyntaxKind.InKeyword,
  SyntaxKind.InstanceOfKeyword,
  SyntaxKind.OfKeyword,
  SyntaxKind.ElseKeyword,
  SyntaxKind.DoKeyword,
  SyntaxKind.TemplateHead,
  SyntaxKind.TemplateMiddle,
]);
const controlConditions = new Set([
  SyntaxKind.IfKeyword,
  SyntaxKind.WhileKeyword,
  SyntaxKind.ForKeyword,
  SyntaxKind.WithKeyword,
  SyntaxKind.SwitchKeyword,
  SyntaxKind.CatchKeyword,
]);

export class SourceScanError extends Error {
  constructor(source, position) {
    const line = source.slice(0, position).split("\n").length;
    super(
      `TypeScript scanner made no progress at line ${line}, offset ${position}`,
    );
    this.position = position;
  }
}

export function sourceTokens(file, source) {
  const variant = /\.[jt]sx$/.test(file)
    ? LanguageVariant.JSX
    : LanguageVariant.Standard;
  const scanner = createScanner(true, variant, source, 0, source.length);
  const tokens = [],
    parens = [];
  let previous,
    beforePrevious,
    expressionPosition = true,
    previousEnd = -1;
  while (true) {
    let kind = scanner.scan();
    if (
      (kind === SyntaxKind.SlashToken ||
        kind === SyntaxKind.SlashEqualsToken) &&
      expressionPosition
    )
      kind = scanner.reScanSlashToken();
    const position = scanner.getTokenStart(),
      end = scanner.getTokenEnd();
    if (
      kind !== SyntaxKind.EndOfFile &&
      (end <= position || end <= previousEnd)
    )
      throw new SourceScanError(source, position);
    tokens.push({
      kind,
      text: scanner.getTokenText(),
      value: scanner.getTokenValue(),
      position,
    });
    if (kind === SyntaxKind.EndOfFile) return tokens;
    const property =
      previous === SyntaxKind.DotToken ||
      previous === SyntaxKind.QuestionDotToken;
    if (kind === SyntaxKind.OpenParenToken)
      parens.push(
        controlConditions.has(previous) &&
          beforePrevious !== SyntaxKind.DotToken &&
          beforePrevious !== SyntaxKind.QuestionDotToken,
      );
    if (kind === SyntaxKind.CloseParenToken)
      expressionPosition = parens.pop() === true;
    // A bang may be a prefix negation or TypeScript's postfix non-null assertion.
    else if (kind !== SyntaxKind.ExclamationToken)
      expressionPosition =
        !property &&
        (expressionStarts.has(kind) ||
          (kind >= SyntaxKind.FirstAssignment &&
            kind <= SyntaxKind.LastAssignment));
    beforePrevious = previous;
    previous = kind;
    previousEnd = end;
  }
}
