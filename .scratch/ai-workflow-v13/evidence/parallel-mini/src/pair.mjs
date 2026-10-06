import { leftTag } from "./left.mjs";
import { rightTag } from "./right.mjs";

export function pairTag(id) {
  return `${leftTag(id)}|${rightTag(id)}`;
}
