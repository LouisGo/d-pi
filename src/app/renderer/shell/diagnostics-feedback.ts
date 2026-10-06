import { BUILD_INFO } from "../../../shared/build-info";
import type {
  DiagnosticFilter,
  DiagnosticSnapshot,
} from "../../../shared/diagnostics";

/** The template includes controlled metadata only; users add their own description. */
export function diagnosticFeedbackMetadata(
  filter: DiagnosticFilter,
  snapshot?: DiagnosticSnapshot,
  commandTraceId?: string,
) {
  return JSON.stringify(
    {
      build: BUILD_INFO,
      filter,
      commandTraceId,
      sampledAt: snapshot?.sampledAt,
      coverage: snapshot?.coverage,
      writer: snapshot?.writer,
      records: snapshot?.records.length,
    },
    null,
    2,
  );
}
