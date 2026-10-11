import type { BrowserWindow, Session } from "electron";
import { expect, it, vi } from "vitest";
import { secureWindow } from "./window";

vi.mock("electron", () => ({ app: { isPackaged: true } }));

type RequestHandler = NonNullable<
  Parameters<Session["setPermissionRequestHandler"]>[0]
>;
type CheckHandler = NonNullable<
  Parameters<Session["setPermissionCheckHandler"]>[0]
>;

it("permits clipboard writes only from the current application main frame and denies reads and other permissions", () => {
  const setRequest = vi.fn<(handler: RequestHandler) => void>();
  const setCheck = vi.fn<(handler: CheckHandler) => void>();
  const contents = {
    isDestroyed: () => false,
    getURL: () => "file:///app/renderer/index.html",
    setWindowOpenHandler: vi.fn(),
    on: vi.fn(),
    session: {
      setPermissionRequestHandler: setRequest,
      setPermissionCheckHandler: setCheck,
    },
  };
  const current = {
    webContents: contents,
    isDestroyed: () => false,
  } as unknown as BrowserWindow;
  secureWindow(current);
  const request = setRequest.mock.calls[0]?.[0];
  expect(request).toBeDefined();
  if (!request) throw Error("Missing permission request handler");
  const details = { isMainFrame: true, requestingUrl: contents.getURL() };
  const result = vi.fn<(allowed: boolean) => void>();
  request(current.webContents, "clipboard-sanitized-write", result, details);
  expect(result).toHaveBeenLastCalledWith(true);
  for (const permission of [
    "clipboard-read",
    "media",
    "notifications",
  ] as const) {
    request(current.webContents, permission, result, details);
    expect(result).toHaveBeenLastCalledWith(false);
  }
  request(current.webContents, "clipboard-sanitized-write", result, {
    ...details,
    isMainFrame: false,
  });
  expect(result).toHaveBeenLastCalledWith(false);
  request(current.webContents, "clipboard-sanitized-write", result, {
    ...details,
    requestingUrl: "https://external.example",
  });
  expect(result).toHaveBeenLastCalledWith(false);
  request(
    {} as BrowserWindow["webContents"],
    "clipboard-sanitized-write",
    result,
    details,
  );
  expect(result).toHaveBeenLastCalledWith(false);
  const check = setCheck.mock.calls[0]?.[0];
  expect(check).toBeDefined();
  if (!check) throw Error("Missing permission check handler");
  expect(
    check(current.webContents, "clipboard-sanitized-write", "file://", details),
  ).toBe(true);
  expect(check(current.webContents, "clipboard-read", "file://", details)).toBe(
    false,
  );
  expect(check(null, "clipboard-sanitized-write", "file://", details)).toBe(
    false,
  );
  expect(
    check(current.webContents, "clipboard-sanitized-write", "file://", {
      ...details,
      isMainFrame: false,
    }),
  ).toBe(false);
  expect(
    check(current.webContents, "clipboard-sanitized-write", "file://", {
      ...details,
      requestingUrl: "https://external.example",
    }),
  ).toBe(false);
});

it("denies late clipboard callbacks after destruction and preserves the newer shared-session owner", () => {
  let request: RequestHandler | undefined;
  let check: CheckHandler | undefined;
  const session = {
    setPermissionRequestHandler: (handler: RequestHandler) => {
      request = handler;
    },
    setPermissionCheckHandler: (handler: CheckHandler) => {
      check = handler;
    },
  };
  function fixture() {
    let destroyed = false;
    const listeners = new Map<string, () => void>();
    const contents = {
      session,
      isDestroyed: () => destroyed,
      getURL: () => {
        if (destroyed) throw Error("Object has been destroyed");
        return "file:///app/index.html";
      },
      setWindowOpenHandler: vi.fn(),
      on: (name: string, callback: () => void) => listeners.set(name, callback),
    };
    const current = {
      isDestroyed: () => destroyed,
      get webContents() {
        if (destroyed) throw Error("Object has been destroyed");
        return contents;
      },
    } as unknown as BrowserWindow;
    secureWindow(current);
    return {
      contents,
      destroy: () => {
        destroyed = true;
        listeners.get("destroyed")?.();
      },
    };
  }
  const first = fixture();
  const oldCheck = check!;
  const oldRequest = request!;
  const details = {
    isMainFrame: true,
    requestingUrl: "file:///app/index.html",
  };
  const second = fixture();
  first.destroy();
  expect(
    oldCheck(
      first.contents as unknown as BrowserWindow["webContents"],
      "clipboard-sanitized-write",
      "file://",
      details,
    ),
  ).toBe(false);
  const result = vi.fn();
  oldRequest(
    first.contents as unknown as BrowserWindow["webContents"],
    "clipboard-sanitized-write",
    result,
    details,
  );
  expect(result).toHaveBeenCalledWith(false);
  expect(
    check!(
      second.contents as unknown as BrowserWindow["webContents"],
      "clipboard-sanitized-write",
      "file://",
      details,
    ),
  ).toBe(true);
  second.destroy();
  expect(
    check!(
      second.contents as unknown as BrowserWindow["webContents"],
      "clipboard-sanitized-write",
      "file://",
      details,
    ),
  ).toBe(false);
});
