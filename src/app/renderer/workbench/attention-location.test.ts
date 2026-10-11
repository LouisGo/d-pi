// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { interactionDraftIdentity } from "../../../modules/execution/contracts/public";
import { ThreadIdSchema } from "../../../shared/identity";
import type { AttentionEntry } from "../../contracts/attention";
import { locateActivation, locateAttention } from "./attention-location";

it("locates the exact native request and its current editor without retargeting an ended source", () => {
  const host = document.createElement("section");
  host.dataset.activationThread = entry.threadId;
  host.tabIndex = -1;
  document.body.append(host);
  host.scrollIntoView = vi.fn();
  const key = {
    threadId: entry.threadId,
    nativeSessionKey: 'native " 中文',
    connectionGeneration: crypto.randomUUID(),
    requestId: 'same [id] " 中文',
  };
  const create = (identity: string, owner: boolean) => {
    const node = document.createElement("article");
    node.dataset.interactionRequestKey = identity;
    node.dataset.editorOwner = String(owner);
    node.tabIndex = -1;
    node.scrollIntoView = vi.fn();
    host.append(node);
    return node;
  };
  const newGeneration = create(
    interactionDraftIdentity(
      key.threadId,
      { ...key, connectionGeneration: crypto.randomUUID() },
      key.requestId,
    ),
    true,
  );
  const otherSession = create(
    interactionDraftIdentity(
      key.threadId,
      { ...key, nativeSessionKey: "other" },
      key.requestId,
    ),
    true,
  );
  const summary = create(
    interactionDraftIdentity(key.threadId, key, key.requestId),
    false,
  );
  const editor = create(
    interactionDraftIdentity(key.threadId, key, key.requestId),
    true,
  );
  const intent: AttentionEntry = {
    ...entry,
    kind: "needs-answer",
    sourceTarget: { kind: "request", requestKey: key },
  };
  try {
    expect(locateActivation(host, intent)).toBe("located");
    expect(document.activeElement).toBe(editor);
    expect(newGeneration.scrollIntoView).not.toHaveBeenCalled();
    expect(otherSession.scrollIntoView).not.toHaveBeenCalled();
    expect(summary.scrollIntoView).not.toHaveBeenCalled();
    editor.remove();
    summary.remove();
    expect(locateActivation(host, intent)).toBe("target-unavailable");
    expect(document.activeElement).toBe(host);
    expect(newGeneration.scrollIntoView).not.toHaveBeenCalled();
  } finally {
    host.remove();
  }
});

const entry: AttentionEntry = {
  threadId: ThreadIdSchema.parse(crypto.randomUUID()),
  eventId: crypto.randomUUID(),
  traceId: crypto.randomUUID(),
  kind: "failed",
  unread: true,
};
it("reveals only a current matching receipt and focuses its readable result, leaving stale details closed", () => {
  const host = document.createElement("section");
  document.body.append(host);
  const details = document.createElement("details");
  const receipt = document.createElement("article");
  receipt.dataset.attentionReceiptTrace = entry.traceId;
  receipt.tabIndex = -1;
  details.append(receipt);
  host.append(details);
  const old = document.createElement("details");
  host.append(old);
  receipt.scrollIntoView = vi.fn();
  locateAttention(host, entry);
  expect(details.open).toBe(true);
  expect(old.open).toBe(false);
  expect(document.activeElement).toBe(receipt);
  expect(receipt.scrollIntoView).toHaveBeenCalled();
  host.remove();
});
it("missing receipt falls back to the current runtime without opening unrelated records, and pending interaction never answers", () => {
  const host = document.createElement("section");
  document.body.append(host);
  const details = document.createElement("details");
  const unrelated = document.createElement("article");
  unrelated.dataset.attentionReceiptTrace = crypto.randomUUID();
  details.append(unrelated);
  host.append(details);
  const runtime = document.createElement("section");
  runtime.dataset.attentionTarget = "runtime";
  runtime.tabIndex = -1;
  runtime.scrollIntoView = vi.fn();
  host.append(runtime);
  locateAttention(host, entry);
  expect(document.activeElement).toBe(runtime);
  expect(details.open).toBe(false);
  const interaction = document.createElement("section");
  interaction.dataset.attentionTarget = "interaction";
  interaction.tabIndex = -1;
  interaction.scrollIntoView = vi.fn();
  const answer = document.createElement("button");
  answer.onclick = vi.fn();
  interaction.append(answer);
  host.append(interaction);
  locateAttention(host, { ...entry, kind: "needs-answer" });
  expect(document.activeElement).toBe(interaction);
  expect(answer.onclick).not.toHaveBeenCalled();
  host.remove();
});
