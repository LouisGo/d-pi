import { expect, it } from "vitest";
import { createDesktopHistory } from "./desktop-history";

it("checks historical movement before changing its location and retains forward history when denied", async () => {
  let admit = true;
  const checked: string[] = [];
  const history = createDesktopHistory(
    async (next) => {
      checked.push(next.pathname);
      return admit;
    },
    () => {},
  );
  history.push("/first");
  await expect.poll(() => history.location.pathname).toBe("/first");
  history.push("/second");
  await expect.poll(() => history.location.pathname).toBe("/second");
  admit = false;
  history.back();
  await expect.poll(() => checked.length).toBe(3);
  expect(history.location.pathname).toBe("/second");
  admit = true;
  history.go(-1);
  await expect.poll(() => history.location.pathname).toBe("/first");
  history.forward();
  await expect.poll(() => history.location.pathname).toBe("/second");
  history.destroy();
});
