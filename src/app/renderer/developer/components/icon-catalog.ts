import type { ComponentType } from "react";
import type { IconProps } from "../../components/icons/common";

// Preview only our public Icon Layer. New exports/modules need no gallery list.
const modules = import.meta.glob<Record<string, ComponentType<IconProps>>>(
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
      .map(([name, Icon]) => ({ key: `${path}:${name}`, name, Icon })),
  )
  .sort((left, right) => left.name.localeCompare(right.name));
