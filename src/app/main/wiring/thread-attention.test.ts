import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  RuntimeViewSchema,
  SubmissionReceiptSchema,
} from "../../../modules/execution/contracts/public";
import { ThreadIdSchema, TraceIdSchema } from "../../../shared/identity";
import type { NotificationCallbacks } from "../lifecycle/system-notifications";
import { ThreadAttention } from "./thread-attention";

const threadId = ThreadIdSchema.parse(randomUUID()),
  traceId = randomUUID(),
  generation = randomUUID();
function view(revision = 1) {
  return RuntimeViewSchema.parse({
    threadId,
    traceId,
    connectionGeneration: generation,
    revision,
    phase: "ready",
    trusted: true,
    busy: true,
    model: null,
    configuration: { code: "runtime.configDefault" },
    message: { code: "runtime.readyToSend" },
    interactions: {
      connectionGeneration: generation,
      unsupported: false,
      items: [
        {
          id: "secret-native-title",
          method: "confirm",
          title: "secret",
          status: "pending",
          expiresAt: null,
        },
      ],
    },
  });
}
function fixture() {
  const openWindow = vi.fn(),
    show = vi.fn(() => vi.fn());
  const attention = new ThreadAttention({
    readPreferences: () => ({ system: false, completion: false }),
    savePreferences: vi.fn(),
    systemNotifications: { supported: () => true, show },
    getText: () => ({ title: "d-pi", body: "Thread" }),
    openWindow,
  });
  return { attention, show, openWindow };
}
it("keeps a deduplicated background question without stealing focus and ignores late revisions", () => {
  const { attention, show, openWindow } = fixture();
  attention.observeRuntime(view());
  const first = attention.snapshot();
  expect(first.entries).toHaveLength(1);
  expect(first.entries[0]).toMatchObject({
    threadId,
    kind: "needs-answer",
    unread: true,
  });
  attention.observeRuntime(view());
  attention.observeRuntime(view(0));
  expect(attention.snapshot()).toEqual(first);
  expect(show).not.toHaveBeenCalled();
  expect(openWindow).not.toHaveBeenCalled();
  attention.observeRuntime({
    ...view(2),
    interactions: {
      connectionGeneration: generation,
      unsupported: false,
      items: [],
    },
  });
  expect(attention.snapshot().entries).toEqual([]);
});

it("renews attention for a new concurrent question even when its trace and kind are unchanged", () => {
  const { attention, show } = fixture();
  attention.setPreferences({ system: true, completion: false });
  attention.setForeground(true);
  attention.visible(threadId);
  attention.observeRuntime(view());
  const first = attention.snapshot().entries[0];
  expect(first?.unread).toBe(false);
  attention.setForeground(false);
  attention.clearVisible();
  const next = view(2);
  if (!next.interactions) throw Error("Missing fixture interactions");
  next.interactions.items.push({
    ...next.interactions.items[0]!,
    id: "second-native-question",
  });
  attention.observeRuntime(next);
  const second = attention.snapshot().entries[0];
  expect(second).toMatchObject({ kind: "needs-answer", unread: true });
  expect(second?.eventId).not.toBe(first?.eventId);
  expect(show).toHaveBeenCalledTimes(1);
  attention.observeRuntime({ ...next, revision: 3 });
  expect(attention.snapshot().entries[0]).toEqual(second);
  expect(show).toHaveBeenCalledTimes(1);
});

it("does not mistake ACK or idle for completion and ignores an older submission finishing after newer dispatch", () => {
  const { attention } = fixture();
  attention.observeRuntime({ ...view(), busy: false, interactions: undefined });
  const first = receipt("unobserved"),
    next = SubmissionReceiptSchema.parse({
      ...receipt("unobserved"),
      submissionId: randomUUID(),
      createdAt: "2026-10-06T02:00:00Z",
    });
  attention.observeReceipt(first);
  expect(attention.snapshot().entries).toEqual([]);
  attention.observeReceipt(next);
  attention.observeReceipt(
    SubmissionReceiptSchema.parse({ ...first, outcome: "completed" }),
  );
  expect(attention.snapshot().entries).toEqual([]);
  attention.observeReceipt(
    SubmissionReceiptSchema.parse({ ...next, outcome: "completed" }),
  );
  expect(attention.snapshot().entries[0]?.kind).toBe("completed");
  attention.observeReceipt(
    SubmissionReceiptSchema.parse({ ...next, outcome: "completed" }),
  );
  expect(attention.snapshot().entries).toHaveLength(1);
});
function receipt(
  outcome: "unobserved" | "completed" | "failed" = "unobserved",
) {
  return SubmissionReceiptSchema.parse({
    submissionId: randomUUID(),
    threadId,
    traceId,
    revision: 1,
    text: "secret text",
    target: {
      processInstanceId: randomUUID(),
      connectionGeneration: generation,
      configContextId: "private-path",
      nativeSessionRef: "private-path",
    },
    requestId: randomUUID(),
    createdAt: "2026-10-06T01:00:00Z",
    updatedAt: "2026-10-06T01:00:01Z",
    state: "acknowledged",
    acknowledgedAt: "2026-10-06T01:00:01Z",
    outcome,
  });
}
it("promotes a completed receipt to an observed late failure and keeps failure on duplicate success", () => {
  const { attention, show } = fixture();
  attention.setPreferences({ system: true, completion: false });
  attention.observeRuntime({ ...view(), busy: false, interactions: undefined });
  const completed = receipt("completed");
  attention.observeReceipt(completed);
  const previous = attention.snapshot().entries[0];
  expect(previous?.kind).toBe("completed");
  expect(show).not.toHaveBeenCalled();
  const failed = SubmissionReceiptSchema.parse({
    ...completed,
    outcome: "failed",
  });
  attention.observeReceipt(failed);
  const current = attention.snapshot().entries[0];
  expect(current).toMatchObject({
    kind: "failed",
    traceId: completed.traceId,
    unread: true,
  });
  expect(current?.eventId).not.toBe(previous?.eventId);
  expect(show).toHaveBeenCalledTimes(1);
  attention.observeReceipt(failed);
  attention.observeReceipt(completed);
  expect(attention.snapshot().entries[0]).toEqual(current);
  expect(show).toHaveBeenCalledTimes(1);
});
it("only trusted foreground context clears unread; stale native click targets latest event and awaits matching opened", () => {
  let callbacks: NotificationCallbacks | undefined;
  const show = vi.fn((_text: unknown, value: NotificationCallbacks) => {
    callbacks = value;
    return vi.fn();
  });
  const openWindow = vi.fn();
  const attention = new ThreadAttention({
    readPreferences: () => ({ system: true, completion: false }),
    savePreferences: vi.fn(),
    systemNotifications: { supported: () => true, show },
    getText: () => ({ title: "d-pi", body: "Thread" }),
    openWindow,
  });
  attention.observeRuntime(view());
  const first = attention.snapshot().entries[0]!;
  expect(show).toHaveBeenCalledTimes(1);
  expect(attention.seen(threadId, first.eventId)).toBe(false);
  attention.observeRuntime({
    ...view(2),
    phase: "failed",
    interactions: undefined,
  });
  const latest = attention.snapshot().entries[0]!;
  callbacks?.click();
  expect(openWindow).toHaveBeenCalledTimes(1);
  const request = attention.snapshot().openRequest!;
  expect(request.eventId).toBe(latest.eventId);
  attention.opened(randomUUID());
  expect(attention.snapshot().openRequest).toEqual(request);
  attention.opened(request.id);
  expect(attention.snapshot().openRequest).toBeNull();
  attention.visible(threadId);
  expect(attention.snapshot().entries[0]?.unread).toBe(true);
  attention.setForeground(true);
  expect(attention.snapshot().entries[0]?.unread).toBe(false);
  attention.clearVisible();
  attention.observeRuntime({
    ...view(3),
    phase: "failed",
    traceId: TraceIdSchema.parse(randomUUID()),
    interactions: undefined,
  });
  expect(attention.snapshot().entries[0]?.unread).toBe(true);
  expect(attention.seen(threadId, latest.eventId)).toBe(false);
});
it("system failure and close do not consume App facts; dispose is idempotent", () => {
  let callbacks: NotificationCallbacks | undefined;
  const release = vi.fn();
  const attention = new ThreadAttention({
    readPreferences: () => ({ system: true, completion: false }),
    savePreferences: vi.fn(),
    systemNotifications: {
      supported: () => true,
      show: (_text, value) => {
        callbacks = value;
        return release;
      },
    },
    getText: () => ({ title: "d-pi", body: "Thread" }),
    openWindow: vi.fn(),
  });
  attention.observeRuntime(view());
  callbacks?.failed();
  expect(attention.snapshot().system).toBe("failed");
  expect(attention.snapshot().entries[0]?.unread).toBe(true);
  callbacks?.closed();
  expect(attention.snapshot().entries[0]?.unread).toBe(true);
  attention.dispose();
  attention.dispose();
  callbacks?.click();
  expect(attention.snapshot().openRequest).toBeNull();
});
it("caps observation and entries at 512 and declares a coverage gap", () => {
  const { attention } = fixture();
  for (let index = 0; index < 513; index++)
    attention.observeRuntime({
      ...view(),
      threadId: ThreadIdSchema.parse(randomUUID()),
    });
  expect(attention.snapshot().entries).toHaveLength(512);
  expect(attention.snapshot().coverageGap).toBe(true);
});
it("coalesces a receipt failure and runtime failure carrying the same operation trace", () => {
  const { attention } = fixture();
  attention.observeRuntime({ ...view(), interactions: undefined });
  const failed = receipt("failed");
  attention.observeReceipt(failed);
  const first = attention.snapshot().entries[0]!;
  attention.observeRuntime({
    ...view(2),
    phase: "failed",
    interactions: undefined,
  });
  expect(attention.snapshot().entries[0]?.eventId).toBe(first.eventId);
});
it("does not let unavailable native support break startup or ephemeral App reminders", () => {
  const attention = new ThreadAttention({
    readPreferences: () => ({ system: true, completion: false }),
    savePreferences: vi.fn(),
    systemNotifications: {
      supported: () => {
        throw Error("native unavailable");
      },
      show: vi.fn(),
    },
    getText: () => ({ title: "d-pi", body: "Thread" }),
    openWindow: vi.fn(),
  });
  attention.observeRuntime(view());
  expect(attention.snapshot().system).toBe("unavailable");
  expect(attention.snapshot().entries).toHaveLength(1);
});
it("diagnoses native throw with the original event metadata without affecting attention", () => {
  const onFailure = vi.fn(() => {
    throw Error("diagnostic sink unavailable");
  });
  const attention = new ThreadAttention({
    readPreferences: () => ({ system: true, completion: false }),
    savePreferences: vi.fn(),
    systemNotifications: {
      supported: () => true,
      show: () => {
        throw Error("native private payload");
      },
    },
    getText: () => ({ title: "d-pi", body: "Thread" }),
    openWindow: vi.fn(),
    onFailure,
  });
  expect(() => attention.observeRuntime(view())).not.toThrow();
  expect(attention.snapshot().system).toBe("failed");
  expect(onFailure).toHaveBeenCalledWith(
    expect.objectContaining({ threadId, traceId, kind: "needs-answer" }),
  );
  expect(JSON.stringify(onFailure.mock.calls)).not.toContain(
    "native private payload",
  );
});
it("reloads persisted notification preferences once storage becomes available without losing observed events", () => {
  const readPreferences = vi
    .fn()
    .mockImplementationOnce(() => {
      throw Error("unavailable");
    })
    .mockReturnValue({ system: true, completion: true });
  const attention = new ThreadAttention({
    readPreferences,
    savePreferences: vi.fn(),
    systemNotifications: { supported: () => true, show: () => () => {} },
    getText: () => ({ title: "d-pi", body: "Thread" }),
    openWindow: vi.fn(),
  });
  attention.observeRuntime(view());
  const eventId = attention.snapshot().entries[0]?.eventId;
  attention.reloadPreferences();
  expect(attention.snapshot().preferences).toEqual({
    system: true,
    completion: true,
  });
  expect(attention.snapshot().entries[0]?.eventId).toBe(eventId);
  expect(attention.snapshot().system).toBe("available");
});
it("retains the original trace on asynchronous native failure", () => {
  let callback: NotificationCallbacks | undefined;
  const onFailure = vi.fn();
  const attention = new ThreadAttention({
    readPreferences: () => ({ system: true, completion: false }),
    savePreferences: vi.fn(),
    systemNotifications: {
      supported: () => true,
      show: (_text, callbacks) => {
        callback = callbacks;
        return () => {};
      },
    },
    getText: () => ({ title: "d-pi", body: "Thread" }),
    openWindow: vi.fn(),
    onFailure,
  });
  attention.observeRuntime(view());
  callback?.failed();
  expect(onFailure).toHaveBeenCalledWith(
    expect.objectContaining({ threadId, traceId }),
  );
  expect(attention.snapshot().entries[0]?.unread).toBe(true);
});
it("accepts distinct submissions prepared in the same millisecond without resurfacing old completion", () => {
  const { attention } = fixture();
  attention.observeRuntime({ ...view(), interactions: undefined });
  const first = receipt(),
    second = receipt();
  attention.observeReceipt(first);
  attention.observeReceipt(second);
  attention.observeReceipt(
    SubmissionReceiptSchema.parse({ ...first, outcome: "completed" }),
  );
  expect(attention.snapshot().entries).toEqual([]);
  attention.observeReceipt(
    SubmissionReceiptSchema.parse({ ...second, outcome: "completed" }),
  );
  expect(attention.snapshot().entries[0]?.kind).toBe("completed");
});
it("an already queued click after a question expires opens current Thread state without resurrecting the question", () => {
  let callback: NotificationCallbacks | undefined;
  const openWindow = vi.fn();
  const attention = new ThreadAttention({
    readPreferences: () => ({ system: true, completion: false }),
    savePreferences: vi.fn(),
    systemNotifications: {
      supported: () => true,
      show: (_text, callbacks) => {
        callback = callbacks;
        return () => {};
      },
    },
    getText: () => ({ title: "d-pi", body: "Thread" }),
    openWindow,
  });
  attention.observeRuntime(view());
  attention.observeRuntime({ ...view(2), interactions: undefined });
  expect(attention.snapshot().entries).toEqual([]);
  callback?.click();
  expect(openWindow).toHaveBeenCalledTimes(1);
  expect(attention.snapshot().openRequest?.threadId).toBe(threadId);
  expect(attention.snapshot().entries).toEqual([]);
});
