import { match } from "ts-pattern";
import type {
  ModelPickerPreferenceChange,
  ModelPickerPreferences,
} from "../contracts/public";

const emptyKeys: readonly string[] = Object.freeze([]);
export const EMPTY_MODEL_PICKER_PREFERENCES = Object.freeze({
  favorites: emptyKeys,
  hidden: emptyKeys,
  order: emptyKeys,
});

export function modelKey(provider: string, id: string): string {
  return JSON.stringify([provider, id]);
}

export function updateModelPickerPreferences(
  current: ModelPickerPreferences | undefined,
  change: ModelPickerPreferenceChange,
): ModelPickerPreferences {
  const source = current ?? EMPTY_MODEL_PICKER_PREFERENCES;
  const normalized: ModelPickerPreferences = {
    favorites: [...new Set(source.favorites)],
    hidden: [...new Set(source.hidden)],
    order: [...new Set(source.order)],
  };
  return match(change)
    .with({ kind: "favorite" }, ({ key, value }) => ({
      ...normalized,
      favorites: value
        ? [...new Set([...normalized.favorites, key])]
        : normalized.favorites.filter((favorite) => favorite !== key),
    }))
    .with({ kind: "visibility" }, ({ key, value }) => ({
      ...normalized,
      hidden: value
        ? normalized.hidden.filter((hidden) => hidden !== key)
        : [...new Set([...normalized.hidden, key])],
    }))
    .with({ kind: "move" }, ({ key, before }) => {
      if (key === before) return normalized;
      const order = normalized.order.filter((ordered) => ordered !== key);
      const index = before === null ? -1 : order.indexOf(before);
      // A missing anchor appends. Full catalog reordering uses the order intent.
      order.splice(index < 0 ? order.length : index, 0, key);
      return { ...normalized, order };
    })
    .with({ kind: "order" }, ({ keys }) => ({
      ...normalized,
      order: [...new Set(keys)],
    }))
    .exhaustive();
}
