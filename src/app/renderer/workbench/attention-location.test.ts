// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { ThreadIdSchema } from "../../../shared/identity";
import type { AttentionEntry } from "../../contracts/attention";
import { locateAttention } from "./attention-location";

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
