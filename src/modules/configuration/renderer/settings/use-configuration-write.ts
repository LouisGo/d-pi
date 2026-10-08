import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  type ConfigurationBridge,
  type ConfigurationCommand,
  type ConfigurationReply,
  sameConfigurationScope,
} from "../../contracts/public";

type WriteCommand = Extract<
  ConfigurationCommand,
  {
    kind:
      | "logout"
      | "refresh-catalog"
      | "provider-enable"
      | "set-model-role"
      | "upsert-custom-model"
      | "delete-custom-model";
  }
>;
type WriteResult =
  | { kind: "saved" }
  | {
      kind: "failed";
      code:
        | Extract<ConfigurationReply, { kind: "failed" }>["code"]
        | "transport-failed"
        | "identity-mismatch";
      traceId: string;
    };

export function useConfigurationWrite(bridge: ConfigurationBridge) {
  const client = useQueryClient();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WriteResult | null>(null);
  const request = async (command: WriteCommand): Promise<boolean> => {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setResult(null);
    try {
      const reply = await bridge.request(command);
      if (
        reply.traceId !== command.traceId ||
        !sameConfigurationScope(reply.scope, command.scope)
      ) {
        setResult({
          kind: "failed",
          code: "identity-mismatch",
          traceId: command.traceId,
        });
        return false;
      }
      if (reply.kind !== "done") {
        setResult({
          kind: "failed",
          code:
            reply.kind === "failed" ? reply.code : "configuration-unavailable",
          traceId: command.traceId,
        });
        return false;
      }
      setResult({ kind: "saved" });
      await client.invalidateQueries({
        queryKey: ["configuration", command.scope],
      });
      return true;
    } catch {
      setResult({
        kind: "failed",
        code: "transport-failed",
        traceId: command.traceId,
      });
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return { busy, result, request };
}
