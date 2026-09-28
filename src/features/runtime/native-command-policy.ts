import { match } from "ts-pattern";

// OMP 18.3.0 helpers/parse.ts: leading slash, case-sensitive command name,
// earliest whitespace or colon separator; subcommands trim and lowercase.
// Keep SDK/vendor imports in its Bun adapter. This narrow policy protects App
// identities; it is not a tool sandbox or a general slash-command implementation.
export function changesManagedSession(text: string): boolean {
  if (!text.startsWith("/")) return false;
  const body = text.slice(1);
  const separator = body.search(/[\s:]/);
  const name = separator === -1 ? body : body.slice(0, separator);
  const args = separator === -1 ? "" : body.slice(separator + 1).trim();
  return (
    match(name)
      .with("move", "wt", "worktree", () => true)
      .with("session", () => args.toLowerCase() === "delete")
      // Other native commands retain official semantics, including TUI-only names.
      .otherwise(() => false)
  );
}
