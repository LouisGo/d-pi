import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { installConversationCacheBudget } from "./conversation-cache";

it("applies the resident byte allowance even when the query count is below its limit", () => {
  const client = new QueryClient();
  const release = installConversationCacheBudget(client, 8, 12000);
  try {
    client.setQueryData(["saved-native-conversation", "A"], "a".repeat(4000));
    client.setQueryData(["saved-native-conversation", "B"], "b".repeat(4000));
    expect(
      client.getQueryData(["saved-native-conversation", "A"]),
    ).toBeUndefined();
    expect(client.getQueryData(["saved-native-conversation", "B"])).toBe(
      "b".repeat(4000),
    );
  } finally {
    release();
    client.clear();
  }
});

it("evicts the least recently visited inactive transcript, preserving mounted readers and other domains", () => {
  const client = new QueryClient();
  const release = installConversationCacheBudget(client, 2);
  const key = (id: string) => ["saved-native-conversation", id];
  const visit = (id: string) => {
    const observer = new QueryObserver(client, {
      queryKey: key(id),
      enabled: false,
    });
    const stop = observer.subscribe(() => {});
    stop();
  };
  try {
    client.setQueryData(key("A"), "saved A");
    client.setQueryData(key("B"), "saved B");
    client.setQueryData(["models"], "configuration");
    visit("A");
    client.setQueryData(key("C"), "saved C");
    expect(client.getQueryData(key("A"))).toBe("saved A");
    expect(client.getQueryData(key("B"))).toBeUndefined();
    expect(client.getQueryData(["models"])).toBe("configuration");
    const current = new QueryObserver(client, {
      queryKey: key("A"),
      enabled: false,
    });
    const stop = current.subscribe(() => {});
    client.setQueryData(key("D"), "saved D");
    client.setQueryData(key("E"), "saved E");
    expect(client.getQueryData(key("A"))).toBe("saved A");
    stop();
  } finally {
    release();
    client.clear();
  }
});
