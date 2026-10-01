import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type {
  ConfigurationBridge,
  ConfigurationCommand,
  ConfigurationEvent,
} from "../../contracts/public";
// Authentication continues when the settings disclosure is closed or its query scope changes.
export function useAuthentication(bridge: ConfigurationBridge) {
  const [key, setKey] = useState("");
  const [answer, setAnswer] = useState("");
  const eventRef = useRef<ConfigurationEvent | null>(null);
  const [event, setEvent] = useState<ConfigurationEvent | null>(null);
  const [challenge, setChallenge] = useState<Extract<
    ConfigurationEvent,
    { kind: "challenge" }
  > | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const client = useQueryClient();
  useEffect(
    () =>
      bridge.subscribe((next) => {
        eventRef.current = next;
        setEvent(next);
        if (next.kind === "challenge") setChallenge(next);
        if (next.kind === "finished") {
          setBusy(false);
          setChallenge(null);
          setAnswer("");
          void client.invalidateQueries({ queryKey: ["configuration"] });
        }
      }),
    [bridge, client],
  );
  const request = async (command: ConfigurationCommand) => {
    setBusy(true);
    if (command.kind === "login") setChallenge(null);
    setResult(null);
    try {
      const reply = await bridge.request(command);
      if (reply.kind === "started") {
        const current = eventRef.current;
        if (current?.jobId === reply.jobId)
          setBusy(current.kind !== "finished");
        else {
          const next: ConfigurationEvent = {
            kind: "progress",
            jobId: reply.jobId,
            scope: reply.scope,
            traceId: reply.traceId,
            source: reply.source,
            message: "",
          };
          eventRef.current = next;
          setEvent(next);
        }
      } else {
        setBusy(false);
        setResult(reply.kind === "done" ? "saved" : "failed");
        if (reply.kind === "done") {
          setKey("");
          void client.invalidateQueries({ queryKey: ["configuration"] });
        }
      }
    } catch {
      setBusy(false);
      setResult("failed");
    }
  };
  const active = !!event && event.kind !== "finished";
  return {
    key,
    setKey,
    answer,
    setAnswer,
    event,
    challenge,
    busy,
    result,
    request,
    active,
  };
}
