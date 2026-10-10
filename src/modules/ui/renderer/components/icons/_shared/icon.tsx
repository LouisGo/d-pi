import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

export type IconProps = {
  size?: 14 | 16 | 18 | 20 | 24;
  className?: string;
};
export type IconVariant = "stroke" | "solid";
export type VariantIconProps = IconProps & { variant?: IconVariant };

// Private vendor adapter. Consumers choose a declared visual variant rather
// than styling paths or passing arbitrary SVG/vendor attributes.
export function IconGraphic({
  icon,
  variant = "stroke",
  size = 16,
  className,
}: VariantIconProps & { icon: IconSvgElement }) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      className={className}
      strokeWidth={variant === "solid" ? 0 : 1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
      data-icon-variant={variant}
    />
  );
}

// Only icons with an explicit, reviewed pair of glyphs expose this API.
// Open paths and brands keep their own representation.
export function createVariantIcon(glyphs: Record<IconVariant, IconSvgElement>) {
  function VariantIcon({ variant = "stroke", ...props }: VariantIconProps) {
    return <IconGraphic {...props} icon={glyphs[variant]} variant={variant} />;
  }
  return Object.assign(VariantIcon, {
    variants: ["stroke", "solid"] as const,
  });
}
