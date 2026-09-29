// Preserve a bounded machine code without persisting messages, paths, SQL or content.
export function diagnosticCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = "code" in error ? error.code : undefined;
  const number = "errcode" in error ? error.errcode : undefined;
  if (typeof code !== "string" || !/^[A-Z0-9_]{1,64}$/.test(code))
    return undefined;
  return typeof number === "number" && Number.isSafeInteger(number)
    ? `${code}:${number}`
    : code;
}
