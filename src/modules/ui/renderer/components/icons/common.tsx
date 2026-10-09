import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  RefreshIcon as RefreshGlyph,
  Search01Icon,
  StarIcon as StarGlyph,
  Tick01Icon,
} from "@hugeicons/core-free-icons";
import {
  createVariantIcon,
  IconGraphic as Icon,
  type IconProps,
} from "./_shared/icon";

export function SearchIcon(props: IconProps) {
  return <Icon {...props} icon={Search01Icon} />;
}

// Hugeicons 4.3.5 / MIT: the star is a single closed rounded path. Reuse its
// silhouette for the solid variant; do not indiscriminately fill other glyphs.
const solidStar = /* @__PURE__ */ StarGlyph.map(
  ([element, attributes]) =>
    [
      element,
      { ...attributes, fill: "currentColor", stroke: "none", strokeWidth: 0 },
    ] as const,
);
export const StarIcon = /* @__PURE__ */ createVariantIcon({
  stroke: StarGlyph,
  solid: solidStar,
});

export function CheckIcon(props: IconProps) {
  return <Icon {...props} icon={Tick01Icon} />;
}

export function ChevronDownIcon(props: IconProps) {
  return <Icon {...props} icon={ArrowDown01Icon} />;
}

export function ChevronUpIcon(props: IconProps) {
  return <Icon {...props} icon={ArrowUp01Icon} />;
}

export function RefreshIcon(props: IconProps) {
  return <Icon {...props} icon={RefreshGlyph} />;
}
