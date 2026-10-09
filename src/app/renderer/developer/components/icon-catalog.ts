import type { ComponentType } from "react";
import type {
  IconVariant,
  VariantIconProps,
} from "../../../../modules/ui/renderer/public";

type PreviewIcon = ComponentType<VariantIconProps> & {
  readonly variants?: readonly IconVariant[];
};

// Preview only our public Icon Layer. New exports/modules need no gallery list.
const modules = import.meta.glob<Record<string, PreviewIcon>>(
  [
    "../../components/icons/**/*.{ts,tsx}",
    "!../../components/icons/**/*.test.{ts,tsx}",
    "!../../components/icons/**/*.d.ts",
    "!../../components/icons/**/_*.{ts,tsx}",
    "!../../components/icons/**/_*/**",
  ],
  { eager: true },
);
export const iconPreviews = Object.entries(modules)
  .flatMap(([path, exports]) =>
    Object.entries(exports)
      .filter(([name]) => /^[A-Z].*Icon$/.test(name))
      .flatMap(([name, Icon]) =>
        (Icon.variants ?? [undefined]).map((variant) => ({
          key: `${path}:${name}:${variant ?? "default"}`,
          name: variant ? `${name} · ${variant}` : name,
          Icon,
          variant,
        })),
      ),
  )
  .sort((left, right) => left.name.localeCompare(right.name));
