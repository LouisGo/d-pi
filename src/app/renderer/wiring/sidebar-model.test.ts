import { expect, it, vi } from "vitest";
import { emptySidebarPreferences } from "../../../modules/preferences/core/public";
import type { DesktopBridge } from "../../contracts/desktop-bridge";
import { SidebarModel } from "./sidebar-model";

const id = "00000000-0000-4000-8000-000000000001";
it("serializes intents and ignores stale discovery snapshots and receipts after disposal", async () => {
  let release: (() => void) | undefined;
  let revision = 1;
  const request = vi.fn(async (command) => {
    if (command.kind === "sidebar-change")
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    return {
      kind: "sidebar",
      traceId: command.traceId,
      snapshot: { revision: ++revision, value: emptySidebarPreferences() },
    };
  });
  const model = new SidebarModel({ request } as Pick<DesktopBridge, "request">);
  model.accept({ revision: 1, value: emptySidebarPreferences() });
  const first = model.change({ kind: "collapse-project", id, value: true });
  const second = model.change({
    kind: "collapse-section",
    section: "pins",
    value: true,
  });
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  release?.();
  await first;
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  release?.();
  await second;
  expect(model.stateStore.getState().snapshot?.revision).toBe(3);
  model.accept({ revision: 1, value: emptySidebarPreferences() });
  expect(model.stateStore.getState().snapshot?.revision).toBe(3);
  const late = model.change({
    kind: "collapse-section",
    section: "pins",
    value: false,
  });
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(3));
  model.dispose();
  release?.();
  await late;
  expect(model.stateStore.getState().snapshot?.revision).toBe(3);
});
it("reconciles an uncertain write by reading, never resending it, and retains last confirmed state on read failure", async () => {
  const request = vi
    .fn()
    .mockRejectedValueOnce(Error("lost ACK"))
    .mockResolvedValueOnce({
      kind: "sidebar",
      traceId: "fixture",
      snapshot: { revision: 2, value: emptySidebarPreferences() },
    });
  const model = new SidebarModel({ request });
  model.accept({ revision: 1, value: emptySidebarPreferences() });
  await model.change({ kind: "collapse-project", id, value: true });
  expect(request.mock.calls.map(([command]) => command.kind)).toEqual([
    "sidebar-change",
    "sidebar-read",
  ]);
  expect(model.stateStore.getState().snapshot?.revision).toBe(2);
  expect(model.stateStore.getState().failed).toBe(true);
  request.mockRejectedValueOnce(Error("offline"));
  await model.refresh();
  expect(model.stateStore.getState().snapshot?.revision).toBe(2);
});
