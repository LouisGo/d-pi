// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AttachmentImports } from "../../../modules/input/renderer/public";
import { createI18n } from "../../../shared/i18n/create-i18n";
import { AttachmentImportBatches } from "./attachment-import-batches";

vi.mock("../../../modules/preferences/renderer/public", () => ({
  useI18n: () => createI18n("en-US"),
}));

it("hides fast import stages, permits cancelling a slow batch and still exposes failures", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  const imports = new AttachmentImports(async () => []);
  const initial = imports.stateStore.getState();
  const job = {
    id: "job",
    name: "notes.txt",
    bytes: 10,
    loaded: 0,
    total: 10,
    reason: null,
    phase: "preparing" as const,
    adoption: "pending" as const,
    attachmentIds: [],
  };
  let snapshot: typeof initial = {
    ...initial,
    pending: 1,
    ready: false,
    batches: [{ id: "batch", source: "drop" as const, jobs: [job] }],
  };
  vi.spyOn(imports.stateStore, "getState").mockImplementation(() => snapshot);
  const cancel = vi.spyOn(imports, "cancel");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = () =>
    act(() =>
      root.render(
        createElement(AttachmentImportBatches, {
          imports,
          editor: null,
          frozen: false,
          activeIds: [],
          isCurrent: () => true,
          onPreview: vi.fn(),
        }),
      ),
    );
  try {
    await render();
    expect(host.textContent).toBe("");
    await act(() => vi.advanceTimersByTime(500));
    expect(host.textContent).toBe("");
    await act(() => vi.advanceTimersByTime(100));
    const button = host.querySelector("button");
    expect(button).not.toBeNull();
    await act(() => button?.click());
    expect(cancel).toHaveBeenCalledWith("batch", true);
    snapshot = {
      ...initial,
      ready: false,
      batches: [
        {
          id: "failed",
          source: "drop",
          jobs: [
            { ...job, phase: "failed", reason: "read-or-transport-failed" },
          ],
        },
      ],
    };
    await render();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "failed",
    );
  } finally {
    await act(() => root.unmount());
    imports.dispose();
    host.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
