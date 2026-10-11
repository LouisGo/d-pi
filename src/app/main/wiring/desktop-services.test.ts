import { afterEach, expect, it, vi } from "vitest";
import type {
  RuntimeView,
  SubmissionReply,
} from "../../../modules/execution/contracts/public";

const fixture = vi.hoisted(() => ({
  callbacks: [] as unknown[][],
  store: {
    threads: {
      threadContext: vi.fn(),
      activeThread: vi.fn<() => { threadId: string } | null>(() => null),
    },
    preferences: { read: () => ({ locale: "system" }) },
  },
}));
vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getPath: () => "/tmp/d-pi-attention-services-test",
  },
  dialog: {},
  nativeImage: {},
  shell: {},
}));
vi.mock("./app-storage", () => ({ AppStorage: { open: () => fixture.store } }));
vi.mock("./attachment-service", () => ({
  createAttachmentService: () => ({ startMaintenance: vi.fn() }),
}));
vi.mock("./desktop-command-service", () => ({
  DesktopCommandService: class {},
}));
vi.mock("../../../modules/configuration/main/public", () => ({
  NativeConfiguration: class {},
}));
vi.mock("../../../modules/execution/main/public", () => ({
  RuntimeService: class {
    releaseIfIdle = vi.fn(async () => false);
    nativeResidency = () => ({ kind: "cold" as const });
    coolIfIdle = vi.fn(async () => ({
      kind: "retained" as const,
      reason: "unavailable" as const,
    }));
    constructor(...args: unknown[]) {
      fixture.callbacks.push(args);
    }
  },
}));

import { createDesktopServices } from "./desktop-services";

afterEach(() => {
  fixture.callbacks.length = 0;
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  fixture.store.threads.activeThread.mockReturnValue(null);
});

it("continues Main observation without a window and isolates observer failure from renderer publication", () => {
  const onRuntimeView = vi.fn();
  const onSubmissionReceipt = vi.fn();
  const send = vi.fn();
  let open = false;
  const services = createDesktopServices({
    mainDirectory: "/tmp",
    getWindow: () => (open ? ({ webContents: { send } } as never) : null),
    getDiagnostics: () => undefined,
    currentT: () => (() => "") as never,
    applyStoredLocale: () => {},
    onRuntimeView,
    onSubmissionReceipt,
  });
  services.initializeStorage();
  services.getRuntime(crypto.randomUUID());
  const publishView = fixture.callbacks[0]?.[4] as (view: RuntimeView) => void;
  const publishReply = fixture.callbacks[0]?.[5] as (
    reply: SubmissionReply,
  ) => void;
  const view = { threadId: crypto.randomUUID(), phase: "ready" } as RuntimeView;
  const receipt = {
    kind: "receipt",
    receipt: { threadId: view.threadId },
  } as Extract<SubmissionReply, { kind: "receipt" }>;
  publishView(view);
  publishReply(receipt);
  expect(onRuntimeView).toHaveBeenCalledExactlyOnceWith(view);
  expect(onSubmissionReceipt).toHaveBeenCalledExactlyOnceWith(receipt.receipt);
  expect(send).not.toHaveBeenCalled();
  open = true;
  onRuntimeView.mockImplementation(() => {
    throw Error("observer failure");
  });
  onSubmissionReceipt.mockImplementation(() => {
    throw Error("observer failure");
  });
  expect(() => publishView(view)).not.toThrow();
  expect(() => publishReply(receipt)).not.toThrow();
  expect(send).toHaveBeenCalledWith("runtime:state", view);
  expect(send).toHaveBeenCalledWith("submission:state", receipt);
});

it("evicts confirmed released runtimes without stopping live scopes and reconstructs on reopen", async () => {
  const services = createDesktopServices({
    mainDirectory: "/tmp",
    getWindow: () => null,
    getDiagnostics: () => undefined,
    currentT: () => (() => "") as never,
    applyStoredLocale: () => {},
  });
  services.initializeStorage();
  const exitedId = crypto.randomUUID();
  const liveId = crypto.randomUUID();
  const exited = services.getRuntime(exitedId);
  const live = services.getRuntime(liveId);
  if (!exited || !live) throw Error("missing runtime");
  vi.mocked(exited.releaseIfIdle).mockResolvedValue(true);
  const settled = fixture.callbacks[0]?.[10] as () => void;
  settled?.();
  await vi.waitFor(() => expect(services.runtimes.has(exitedId)).toBe(false));
  expect(services.runtimes.get(liveId)).toBe(live);
  expect(services.getRuntime(exitedId)).not.toBe(exited);
});

it("uses the stored selection for warm protection even when a background caller requested its runtime most recently", async () => {
  vi.stubEnv("D_PI_NATIVE_WARM_LIMIT", "0");
  let open = true;
  const services = createDesktopServices({
    mainDirectory: "/tmp",
    getWindow: () =>
      open ? ({ webContents: { send: vi.fn() } } as never) : null,
    getDiagnostics: () => undefined,
    currentT: () => (() => "") as never,
    applyStoredLocale: () => {},
  });
  services.initializeStorage();
  const selectedId = crypto.randomUUID(),
    backgroundId = crypto.randomUUID();
  fixture.store.threads.activeThread.mockReturnValue({ threadId: selectedId });
  const selected = services.getRuntime(selectedId),
    background = services.getRuntime(backgroundId);
  if (!selected || !background) throw Error("missing runtimes");
  vi.spyOn(selected, "nativeResidency").mockReturnValue({ kind: "warm" });
  vi.spyOn(background, "nativeResidency").mockReturnValue({ kind: "warm" });
  await vi.waitFor(() => expect(background.coolIfIdle).toHaveBeenCalled());
  expect(selected.coolIfIdle).not.toHaveBeenCalled();
  expect(
    services.nativeResidency?.items.find((item) => item.threadId === selectedId)
      ?.residency,
  ).toEqual({ kind: "protected", reason: "selected" });
  open = false;
  (fixture.callbacks[0]?.[10] as () => void)();
  await vi.waitFor(() => expect(selected.coolIfIdle).toHaveBeenCalled());
  await services.closeThreadCommands();
});
