import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type {
  ConfigurationBridge,
  ConfigurationCommand,
  ConfigurationEvent,
  ConfigurationReply,
} from "../../contracts/public";
import { sameConfigurationScope } from "../../contracts/public";

type AuthenticationResult =
  | { kind: "saved" }
  | {
      kind: "failed";
      code:
        | Extract<ConfigurationReply, { kind: "failed" }>["code"]
        | "transport-failed"
        | "identity-mismatch";
      traceId: string;
    };
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
  const [result, setResult] = useState<AuthenticationResult | null>(null);
  const [savingKey, setSavingKey] = useState(false);
  const requesting = useRef(false);
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
    if (requesting.current) return;
    requesting.current = true;
    setBusy(true);
    setSavingKey(command.kind === "save-key");
    if (command.kind === "login" || command.kind === "save-key") {
      setChallenge(null);
      eventRef.current = null;
      setEvent(null);
    }
    setResult(null);
    try {
      const reply = await bridge.request(command);
      if (
        reply.traceId !== command.traceId ||
        ("scope" in command &&
          !sameConfigurationScope(reply.scope, command.scope))
      ) {
        setBusy(false);
        setResult({
          kind: "failed",
          code: "identity-mismatch",
          traceId: command.traceId,
        });
        return;
      }
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
        setResult(
          reply.kind === "done"
            ? { kind: "saved" }
            : {
                kind: "failed",
                code:
                  reply.kind === "failed"
                    ? reply.code
                    : "configuration-unavailable",
                traceId: command.traceId,
              },
        );
        if (reply.kind === "done") {
          setKey("");
          void client.invalidateQueries({ queryKey: ["configuration"] });
        }
      }
    } catch {
      setBusy(false);
      setResult({
        kind: "failed",
        code: "transport-failed",
        traceId: command.traceId,
      });
    } finally {
      requesting.current = false;
      setSavingKey(false);
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
    savingKey,
    result,
    request,
    active,
  };
}
