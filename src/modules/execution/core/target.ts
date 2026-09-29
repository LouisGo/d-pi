import type { FrozenSubmission } from "../contracts/public";

type SubmissionTarget = FrozenSubmission["target"];

export function sameSubmissionTarget(
  current: SubmissionTarget,
  candidate: SubmissionTarget,
): boolean {
  return (
    current.processInstanceId === candidate.processInstanceId &&
    current.connectionGeneration === candidate.connectionGeneration &&
    current.configContextId === candidate.configContextId &&
    current.nativeSessionRef === candidate.nativeSessionRef
  );
}
