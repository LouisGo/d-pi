import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { installConversationCacheBudget } from "./conversation-cache";

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
