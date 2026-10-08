import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { SyntaxKind } from "typescript/unstable/ast";
import { SourceScanError, sourceTokens } from "./source-tokens.mjs";

const policyFile = "src/app/renderer/styles/interaction.css";
const decodeCss = (value) =>
  value.replace(/\\([\da-f]{1,6})\s?|\\([^\r\n\f])/gi, (_, hex, char) =>
    hex ? String.fromCodePoint(Number.parseInt(hex, 16)) : char,
  );
const pointer = (value) => /\bpointer\b/i.test(value);
const selectionOverride = (value) => value.trim().toLowerCase() !== "none";

/** Static authoring gate. Vendor styles and actual cascade are checked in Electron. */
export function interactionViolations(file, source) {
  const issues = [];
  const report = (code, position, detail, contents = source) =>
    issues.push(
      `${code}: ${file}:${contents.slice(0, position).split("\n").length}: ${detail}`,
    );
  if (file.endsWith(".css")) {
    const css = decodeCss(
      source.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
        comment.replace(/[^\n]/g, ""),
      ),
    );
    for (const match of css.matchAll(
      /\b(cursor|(?:-webkit-)?user-select)\s*:\s*([^;}]+)/gi,
    )) {
      const property = match[1].toLowerCase();
      const value = match[2].replace(/\s*!important\s*$/i, "").trim();
      if (property === "cursor" && pointer(value))
        report("UI-CURSOR", match.index, "use default for click targets", css);
      if (
        property.endsWith("user-select") &&
        selectionOverride(value) &&
        file !== policyFile
      )
        report(
          "UI-SELECTION",
          match.index,
          "use data-selectable or the native editable contract",
          css,
        );
    }
    return issues;
  }
  let tokens;
  try {
    tokens = sourceTokens(file, source);
  } catch (error) {
    if (!(error instanceof SourceScanError)) throw error;
    report("UI-SCAN", error.position, error.message);
    return issues;
  }
  const stringKinds = new Set([
    SyntaxKind.StringLiteral,
    SyntaxKind.NoSubstitutionTemplateLiteral,
    SyntaxKind.TemplateHead,
    SyntaxKind.TemplateMiddle,
    SyntaxKind.TemplateTail,
  ]);
  const valueOf = (token) =>
    token && stringKinds.has(token.kind) ? token.value : undefined;
  const checkProperty = (name, value, position) => {
    if (name === "cssText" && value) {
      for (const violation of interactionViolations(`${file}.css`, value)) {
        report(
          violation.split(":")[0],
          position,
          "static CSS writes must follow the shared interaction policy",
        );
      }
    }
    if (name === "cursor" && value && pointer(value))
      report("UI-CURSOR", position, "use default for click targets");
    if (
      [
        "userSelect",
        "webkitUserSelect",
        "WebkitUserSelect",
        "user-select",
        "-webkit-user-select",
      ].includes(name) &&
      value &&
      selectionOverride(value)
    )
      report(
        "UI-SELECTION",
        position,
        "use data-selectable or the native editable contract",
      );
  };
  for (const [index, token] of tokens.entries()) {
    const text = valueOf(token);
    if (text !== undefined) {
      if (
        /(?:^|[\s:!])cursor-(?:pointer|\[[^\]]*\bpointer\b[^\]]*\])(?:$|[\s!])|\[cursor\s*:[^\]]*\bpointer\b[^\]]*\]/i.test(
          text.replaceAll("_", " "),
        )
      )
        report(
          "UI-CURSOR",
          token.position,
          "hand cursor utility is prohibited",
        );
      if (
        /(?:^|[\s:!])select-(?:text|all|auto|\[(?!none\])[^\]]+\])(?:$|[\s!])|\[(?:user-select|userSelect)\s*:\s*(?!none\])[^\]]+\]/i.test(
          text,
        )
      )
        report("UI-SELECTION", token.position, "use data-selectable");
    }
    const name = text ?? token.text;
    if (
      [SyntaxKind.ColonToken, SyntaxKind.EqualsToken].includes(
        tokens[index + 1]?.kind,
      )
    )
      checkProperty(name, valueOf(tokens[index + 2]), token.position);
    if (
      tokens[index + 1]?.kind === SyntaxKind.CloseBracketToken &&
      tokens[index + 2]?.kind === SyntaxKind.EqualsToken
    )
      checkProperty(name, valueOf(tokens[index + 3]), token.position);
    if (
      token.text === "setProperty" &&
      tokens[index + 1]?.kind === SyntaxKind.OpenParenToken &&
      tokens[index + 3]?.kind === SyntaxKind.CommaToken
    )
      checkProperty(
        valueOf(tokens[index + 2]),
        valueOf(tokens[index + 4]),
        token.position,
      );
    if (
      token.text === "setAttribute" &&
      valueOf(tokens[index + 2]) === "style" &&
      tokens[index + 3]?.kind === SyntaxKind.CommaToken
    )
      checkProperty("cssText", valueOf(tokens[index + 4]), token.position);
    if (
      token.text === "button" &&
      tokens[index - 1]?.kind === SyntaxKind.LessThanToken
    ) {
      const attributes = [];
      for (
        let cursor = index + 1;
        cursor < tokens.length &&
        tokens[cursor].kind !== SyntaxKind.GreaterThanToken;
        cursor++
      )
        attributes.push(tokens[cursor]);
      const classIndex = attributes.findIndex(
        (attribute) => attribute.text === "className",
      );
      const classes = valueOf(attributes[classIndex + 2]) ?? "";
      if (
        !/\bui-button\b/.test(classes) ||
        !/\bui-button-(primary|ghost|navigation)\b/.test(classes)
      )
        report(
          "UI-BUTTON",
          token.position,
          "use shared Button or the static ui-button native adapter",
        );
    }
  }
  return issues;
}

export function checkInteractionPolicy(root) {
  const issues = [];
  const entry = join(root, "src/app/renderer/styles/app.css");
  if (existsSync(entry)) {
    if (!existsSync(join(root, policyFile)))
      issues.push(`UI-POLICY: missing ${policyFile}`);
    if (
      !/@import\s+["']\.\/interaction\.css["']/.test(
        readFileSync(entry, "utf8"),
      )
    )
      issues.push("UI-POLICY: app.css must load the shared interaction policy");
  }
  function scan(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (
        /\.(css|[cm]?[jt]sx?)$/.test(entry.name) &&
        !/\.(test|spec)\./.test(entry.name)
      ) {
        issues.push(
          ...interactionViolations(
            relative(root, file).replaceAll("\\", "/"),
            readFileSync(file, "utf8"),
          ),
        );
      }
    }
  }
  // Includes module renderers and any shared authoring helper, not generated output or dependencies.
  scan(join(root, "src"));
  return issues;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const rootIndex = process.argv.indexOf("--root");
  const issues = checkInteractionPolicy(
    resolve(rootIndex < 0 ? "." : process.argv[rootIndex + 1]),
  );
  if (issues.length) {
    console.error(issues.join("\n"));
    process.exitCode = 1;
  } else
    console.log("PASS: cursor, selection and shared-button authoring policy");
}
