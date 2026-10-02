// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { GitBridge } from "../../../modules/changes/contracts/public";
import type { FileBridge } from "../../../modules/files/contracts/public";
import type { CodeView } from "../../../modules/files/renderer/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { ThreadContextSchema } from "../../../modules/threads/contracts/public";
import { FilePanel } from "./file-panel";

it.each(["file", "diff"] as const)(
  "opens a %s into a focused, visible result while retaining the collapsed project browser",
  async (kind) => {
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
    const files: FileBridge = {
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
    const git: GitBridge = {
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
    const Editor = ({ view }: { view: CodeView }) =>
      createElement(
        "pre",
        { "data-result": true },
        view.kind === "file" ? view.text : view.right.text,
      );
    try {
      await act(() =>
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
              }),
            }),
          ),
        ),
      );
      await vi.waitFor(async () => {
        await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
        expect(container.querySelector(".file-list button")).not.toBeNull();
      });
      const browserList = container.querySelector(".file-list");
      const target = container.querySelector<HTMLButtonElement>(
        kind === "file" ? ".file-list button" : ".change-list button",
      );
      if (!target) throw Error("missing file/diff target");
      await act(() => target.click());
      expect(
        container.querySelector<HTMLDetailsElement>(".file-navigation")?.open,
      ).toBe(false);
      const result = container.querySelector(".file-result");
      expect(result).not.toBeNull();
      expect(document.activeElement).toBe(result);
      expect(result?.textContent).toContain("Reading");
      await act(async () => finish?.());
      await vi.waitFor(async () => {
        await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
        expect(result?.querySelector("[data-result]")?.textContent).toBe(
          kind === "file" ? "file result" : "diff result",
        );
      });
      const details =
        container.querySelector<HTMLDetailsElement>(".file-navigation");
      if (!details) throw Error("missing browser");
      await act(() => {
        details.open = true;
        details.dispatchEvent(new Event("toggle"));
      });
      expect(container.querySelector(".file-list")).toBe(browserList);
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
