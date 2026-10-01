// Run with the pinned Bun; imports the installed, unmodified OMP 18.3.0 parser/registry.
import assert from "node:assert/strict";
import { lookupBuiltinSlashCommand } from "@oh-my-pi/pi-coding-agent/slash-commands/builtin-registry";
import {
  parseSlashCommand,
  parseSubcommand,
} from "@oh-my-pi/pi-coding-agent/slash-commands/helpers/parse";
import { changesManagedSession } from "../../src/modules/execution/core/submission/native-command-policy.ts";

const cases = [
  ["/move /tmp", true, "move"],
  ["/move:/tmp", true, "move"],
  ["/move\n/tmp", true, "move"],
  ["/wt branch", true, "wt"],
  ["/worktree:branch", true, "wt"],
  ["/session:DELETE\t", true, "session"],
  ["/session\tdelete", true, "session"],
  ["/session delete extra", false, "session"],
  ["/session info", false, "session"],
  ["/delete", false, "delete"],
  ["/new", false, "new"],
  ["/model", false, "model"],
  ["/MOVE /tmp", false, undefined],
  [" /move /tmp", false, undefined],
  ["explain /move", false, undefined],
];
for (const [text, blocked, canonical] of cases) {
  assert.equal(changesManagedSession(text), blocked, text);
  const parsed = parseSlashCommand(text);
  const command = parsed ? lookupBuiltinSlashCommand(parsed.name) : undefined;
  assert.equal(command?.name, canonical, text);
  if (blocked) {
    assert.equal(typeof command.handle, "function", text);
    if (canonical === "session")
      assert.deepEqual(parseSubcommand(parsed.args), {
        verb: "delete",
        rest: "",
      });
  }
  if (text === "/delete" || text === "/new")
    assert.equal(command.handle, undefined, text);
}
console.log(
  `PASS: ${cases.length} command policy cases agree with pinned official parser/aliases/headless registry; no handlers executed`,
);
