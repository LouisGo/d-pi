import { expect, it } from "vitest";
import { createLayoutModel } from "./model";

const defaults = {
  sidebar: { open: true, size: 280 },
  workspace: { open: false, size: 416 },
  bottom: { open: false, size: 220 },
};
it("collapse remembers the last usable size and restores the same intent after reload", () => {
  let saved = "";
  const storage = {
    getItem: () => saved,
    setItem: (_key: string, value: string) => {
      saved = value;
    },
  };
  const model = createLayoutModel(defaults, storage);
  model.commit("sidebar", 310);
  model.commit("sidebar", 0);
  const reload = createLayoutModel(defaults, storage);
  expect(reload.store.getState().sidebar).toEqual({ open: false, size: 310 });
  reload.toggle("sidebar");
  expect(reload.store.getState().sidebar).toEqual({ open: true, size: 310 });
});
it("bad or inaccessible storage does not affect business data or prevent resizing", () => {
  const model = createLayoutModel(defaults, {
    getItem: () => '{"workspace":{"open":true,"size":-1}}',
    setItem: () => {
      throw Error("quota");
    },
  });
  expect(model.store.getState()).toEqual(defaults);
  model.commit("bottom", 170);
  expect(model.store.getState().bottom).toEqual({ open: true, size: 170 });
});
