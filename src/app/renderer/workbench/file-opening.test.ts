// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type {
  GitBridge,
  GitReply,
  GitRequest,
} from "../../../modules/changes/contracts/public";
import type {
  FileBridge,
  FileReply,
  FileRequest,
} from "../../../modules/files/contracts/public";
import type { CodeLocation } from "../../../modules/files/core/public";
import type { CodeView } from "../../../modules/files/renderer/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { ThreadContextSchema } from "../../../modules/threads/contracts/public";
import { FilePanel } from "./file-panel";
import type { WorkspaceSourceTarget } from "./source-target";

it.each(["file", "diff", "hidden-window"] as const)(
  "releases a hidden %s reader and viewer, retains the target, and resamples on return",
  async (scenario) => {
    const kind = scenario === "diff" ? "diff" : "file";
    const visibility = Object.getOwnPropertyDescriptor(
      document,
      "visibilityState",
    );
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const resource = ThreadContextSchema.parse({
      threadId: crypto.randomUUID(),
      workingDirectoryId: crypto.randomUUID(),
      directory: "/fixture",
    });
    const requests: (FileRequest | GitRequest)[] = [];
    const cancels: string[] = [];
    let finish: (() => void) | undefined;
    let ready = false;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let mounted = 0;
    const Editor = () => {
      useEffect(() => {
        mounted++;
        return () => {
          mounted--;
        };
      }, []);
      return createElement("pre", { "data-viewer": true }, "current capture");
    };
    const cancel = async (identity: {
      operationId: string;
      traceId: string;
    }) => {
      cancels.push(identity.operationId);
      return { kind: "acknowledged" as const, ...identity };
    };
    const files: FileBridge = {
      cancel,
      request: async (request) => {
        requests.push(request);
        if (request.kind === "read" && !ready) await gate;
        const reply: FileReply =
          request.kind === "list"
            ? {
                kind: "entries",
                path: "",
                truncated: false,
                entries: [{ path: "a.ts", name: "a.ts", kind: "file" }],
              }
            : {
                kind: "text",
                path: "a.ts",
                text: "current",
                bytes: 7,
                version: "current",
                capturedAt: "now",
                coverage: "complete",
              };
        return {
          kind: "completed",
          operationId: request.operationId,
          traceId: request.traceId,
          reply,
        };
      },
    };
    const git: GitBridge = {
      cancel,
      request: async (request) => {
        requests.push(request);
        if (request.kind === "diff" && !ready) await gate;
        const reply: GitReply =
          request.kind === "list"
            ? {
                kind: "changes",
                repository: "/fixture",
                head: "head",
                capturedAt: "now",
                coverage: "project-paths-current-sample",
                truncated: false,
                entries: [
                  { path: "a.ts", scope: "index-worktree", status: "modified" },
                ],
              }
            : {
                kind: "diff",
                repository: "/fixture",
                head: "head",
                path: "a.ts",
                scope: "index-worktree",
                capturedAt: "now",
                coverage: "single-file-current-sample",
                left: {
                  kind: "text",
                  text: "old",
                  version: "old",
                  source: "index",
                  coverage: "complete",
                },
                right: {
                  kind: "text",
                  text: "current",
                  version: "current",
                  source: "worktree",
                  coverage: "complete",
                },
              };
        return {
          kind: "completed",
          operationId: request.operationId,
          traceId: request.traceId,
          reply,
        };
      },
    };
    const render = async (active: boolean) =>
      act(() => {
        if (scenario === "hidden-window") {
          Object.defineProperty(document, "visibilityState", {
            configurable: true,
            value: active ? "visible" : "hidden",
          });
          document.dispatchEvent(new Event("visibilitychange"));
        }
        return root.render(
          createElement(
            QueryClientProvider,
            { client },
            createElement(I18nProvider, {
              initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
              children: createElement(FilePanel, {
                resource,
                files,
                git,
                editor: Editor,
                onAttach: () => {},
                active: scenario === "hidden-window" ? true : active,
              }),
            }),
          ),
        );
      });
    const settle = async () =>
      act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    try {
      await render(false);
      await settle();
      expect(requests).toHaveLength(0);
      expect(mounted).toBe(0);
      await render(true);
      await vi.waitFor(async () => {
        await settle();
        expect(container.querySelector(".file-list button")).not.toBeNull();
      });
      const button = container.querySelector<HTMLButtonElement>(
        kind === "file" ? ".file-list button" : ".change-list button",
      );
      if (!button) throw Error("missing target");
      await act(() => button.click());
      const pending = requests.find(
        (request) => request.kind === (kind === "file" ? "read" : "diff"),
      );
      expect(pending).toBeDefined();
      await render(false);
      expect(cancels).toContain(pending?.operationId);
      ready = true;
      await act(() => finish?.());
      await settle();
      expect(mounted).toBe(0);
      expect(
        client
          .getQueryCache()
          .getAll()
          .filter((query) => query.state.data !== undefined),
      ).toHaveLength(0);
      await render(true);
      await vi.waitFor(async () => {
        await settle();
        expect(mounted).toBe(1);
        expect(
          container.querySelector(".file-result strong")?.textContent,
        ).toContain("a.ts");
      });
      expect(
        requests.filter(
          (request) => request.kind === (kind === "file" ? "read" : "diff"),
        ),
      ).toHaveLength(2);
      await render(false);
      expect(mounted).toBe(0);
      await settle();
      expect(client.getQueryCache().getAll()).toHaveLength(0);
    } finally {
      finish?.();
      await act(() => root.unmount());
      client.clear();
      container.remove();
      if (visibility)
        Object.defineProperty(document, "visibilityState", visibility);
      else Reflect.deleteProperty(document, "visibilityState");
      vi.unstubAllGlobals();
    }
  },
);

it.each([
  { kind: "file", navigation: false, changed: false },
  { kind: "diff", navigation: false, changed: false },
  { kind: "file", navigation: true, changed: false },
  { kind: "diff", navigation: true, changed: false },
  { kind: "file", navigation: true, changed: true },
  { kind: "diff", navigation: true, changed: true },
  { kind: "file", navigation: true, changed: false, superseded: true },
] as const)(
  "opens or rejects a versioned source in the focused result (%j)",
  async (scenario) => {
    const { kind, navigation, changed } = scenario;
    const superseded = "superseded" in scenario && scenario.superseded;
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const resource = ThreadContextSchema.parse({
      threadId: crypto.randomUUID(),
      workingDirectoryId: crypto.randomUUID(),
      directory: "/fixture",
    });
    let finish: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const fileSamples: {
      request: (command: FileRequest) => Promise<FileReply>;
    } = {
      request: async (command) => {
        if (command.kind === "list")
          return {
            kind: "entries",
            path: "",
            entries: [{ path: "README.md", name: "README.md", kind: "file" }],
            truncated: false,
          };
        await gate;
        return {
          kind: "text",
          path: command.path,
          text: "file result",
          bytes: 11,
          version: "fixture",
          capturedAt: "fixture",
          coverage: "complete",
        };
      },
    };
    const gitSamples: { request: (command: GitRequest) => Promise<GitReply> } =
      {
        request: async (command) => {
          if (command.kind === "list")
            return {
              kind: "changes",
              repository: "/fixture",
              head: "fixture",
              capturedAt: "fixture",
              coverage: "project-paths-current-sample",
              entries: [
                {
                  path: "README.md",
                  scope: "index-worktree",
                  status: "modified",
                },
              ],
              truncated: false,
            };
          await gate;
          return {
            kind: "diff",
            repository: "/fixture",
            path: command.path,
            scope: command.scope,
            capturedAt: "fixture",
            head: "fixture",
            coverage: "single-file-current-sample",
            left: {
              kind: "text",
              text: "old text",
              source: "index",
              version: "left",
              coverage: "complete",
            },
            right: {
              kind: "text",
              text: "diff result",
              source: "worktree",
              version: "right",
              coverage: "complete",
            },
          };
        },
      };
    const files: FileBridge = {
      request: async (command) => ({
        kind: "completed",
        operationId: command.operationId,
        traceId: command.traceId,
        reply: await fileSamples.request(command),
      }),
      cancel: async (command) => ({ kind: "acknowledged", ...command }),
    };
    const git: GitBridge = {
      request: async (command) => ({
        kind: "completed",
        operationId: command.operationId,
        traceId: command.traceId,
        reply: await gitSamples.request(command),
      }),
      cancel: async (command) => ({ kind: "acknowledged", ...command }),
    };
    const sourceTarget: WorkspaceSourceTarget =
      kind === "file"
        ? {
            kind: "file",
            file: {
              kind: "captured-workspace",
              threadId: resource.threadId,
              directory: resource.directory,
              path: "README.md",
              version: changed ? "old" : "fixture",
              range: { startLine: 1, endLine: 1 },
            },
          }
        : {
            kind: "diff",
            diff: {
              threadId: resource.threadId,
              directory: resource.directory,
              path: "README.md",
              scope: "index-worktree",
              leftVersion: "left",
              rightVersion: changed ? "old" : "right",
              side: "left",
              range: { startLine: 1, endLine: 1 },
            },
          };
    const intent = { ticket: 1, target: sourceTarget, phase: "ready" as const };
    const onNavigated = vi.fn();
    const Editor = ({
      view,
      location,
      onLocated,
    }: {
      view: CodeView;
      location?: CodeLocation | undefined;
      onLocated?: (located: boolean) => void;
    }) => {
      useEffect(() => {
        if (location) {
          container.querySelector<HTMLElement>("[data-result]")?.focus();
          onLocated?.(true);
        }
      }, [location, onLocated]);
      return createElement(
        "pre",
        {
          "data-result": true,
          tabIndex: -1,
          "data-location": location ? JSON.stringify(location) : undefined,
        },
        view.kind === "file" ? view.text : view.right.text,
      );
    };
    let currentIntent = navigation ? intent : null;
    const renderPanel = () =>
      root.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(I18nProvider, {
            initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
            children: createElement(FilePanel, {
              resource,
              files,
              git,
              editor: Editor,
              onAttach: () => {},
              navigation: currentIntent,
              onNavigated,
            }),
          }),
        ),
      );
    try {
      await act(renderPanel);
      await vi.waitFor(async () => {
        await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
        expect(container.querySelector(".file-list button")).not.toBeNull();
      });
      const browserList = container.querySelector(".file-list");
      const target = container.querySelector<HTMLButtonElement>(
        kind === "file" ? ".file-list button" : ".change-list button",
      );
      if (!target) throw Error("missing file/diff target");
      if (!navigation) await act(() => target.click());
      else if (!superseded) expect(onNavigated).not.toHaveBeenCalled();
      expect(
        container.querySelector<HTMLDetailsElement>(
          ".file-navigation > [data-slot=disclosure]",
        )?.open,
      ).toBe(false);
      const result = container.querySelector(".file-result");
      expect(result).not.toBeNull();
      expect(document.activeElement).toBe(result);
      expect(result?.textContent).toContain("Loading");
      const inspector = document.createElement("button");
      container.append(inspector);
      if (superseded) {
        currentIntent = null;
        await act(renderPanel);
        inspector.focus();
      }
      await act(async () => finish?.());
      await vi.waitFor(async () => {
        await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
        if (changed) {
          expect(result?.textContent).toContain("version has changed");
          expect(result?.querySelector("[data-result]")).toBeNull();
        } else {
          expect(result?.querySelector("[data-result]")?.textContent).toBe(
            kind === "file" ? "file result" : "diff result",
          );
          if (superseded) {
            expect(document.activeElement).toBe(inspector);
            expect(
              result
                ?.querySelector("[data-result]")
                ?.getAttribute("data-location"),
            ).toBeNull();
          } else if (navigation)
            expect(
              result
                ?.querySelector("[data-result]")
                ?.getAttribute("data-location"),
            ).toContain(
              kind === "file" ? '"version":"fixture"' : '"side":"left"',
            );
        }
      });
      const details = container.querySelector<HTMLDetailsElement>(
        ".file-navigation > [data-slot=disclosure]",
      );
      if (!details) throw Error("missing browser");
      await act(() => {
        details.open = true;
        details.dispatchEvent(new Event("toggle"));
      });
      expect(container.querySelector(".file-list")).toBe(browserList);
      if (!changed)
        expect(result?.querySelector("[data-result]")).not.toBeNull();
    } finally {
      finish?.();
      await act(() => root.unmount());
      client.clear();
      container.remove();
      vi.unstubAllGlobals();
    }
  },
);
