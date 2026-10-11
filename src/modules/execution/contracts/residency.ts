export type NativeRetentionReason =
  | "selected"
  | "active-work"
  | "command"
  | "evidence"
  | "unknown"
  | "idle-unconfirmed"
  | "reading-demand"
  | "changed"
  | "permission"
  | "unavailable"
  | "unconfirmed";

export type NativeResidency =
  | { kind: "cold" }
  | { kind: "warm" }
  | { kind: "cooling" }
  | { kind: "protected"; reason: NativeRetentionReason };

export type NativeCooldownResult =
  | { kind: "cooled" }
  | { kind: "retained"; reason: NativeRetentionReason };
