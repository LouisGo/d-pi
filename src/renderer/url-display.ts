export function urlBrand(target: string): "github" | "generic" {
  try {
    const url = new URL(target);
    return ["https:", "http:"].includes(url.protocol) &&
      ["github.com", "www.github.com"].includes(url.hostname)
      ? "github"
      : "generic";
  } catch {
    return "generic";
  }
}
