import { expect, it } from "vitest";
import { projectRelativePath } from "./source-target";

it("routes only a bounded project-relative location while leaving actual authority to Main", () => {
  expect(projectRelativePath("/project", "/project/src/a.ts")).toBe("src/a.ts");
  expect(projectRelativePath("/project/", "./src/a.ts")).toBe("src/a.ts");
  expect(projectRelativePath("/", "/a.ts")).toBe("a.ts");
  for (const path of [
    "/project-other/a",
    "/outside/a",
    "../a",
    "src/../a",
    "artifact://1",
    "a\0b",
    "C:\\outside\\a",
    ".",
    "x".repeat(4097),
  ])
    expect(projectRelativePath("/project", path)).toBeNull();
});
