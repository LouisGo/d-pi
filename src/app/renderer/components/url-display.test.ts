import { expect, it } from "vitest";
import { urlBrand } from "./url-display";

it("matches the actual hostname without fetching or changing the target", () => {
  expect(urlBrand("https://github.com/a?x=1#b")).toBe("github");
  expect(urlBrand("https://github.com.evil.test/a")).toBe("generic");
  expect(urlBrand("https://github.com@elsewhere.test")).toBe("generic");
  expect(urlBrand("not a url")).toBe("generic");
});
