// Adapted structure: shadcn-ui/ui Base Button, MIT, 98a1fe67b439324ddc857f47fbdce056600a4329.
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import type { ComponentPropsWithRef } from "react";

const buttonVariants = cva("ui-button", {
  variants: {
    size: {
      default: "",
      icon: "ui-button-icon",
      status: "ui-button-status",
      round: "ui-button-round",
      thumbnail: "ui-button-thumbnail",
      source: "ui-button-source",
      turn: "ui-button-turn",
    },
    variant: {
      default: "ui-button-primary",
      secondary: "ui-button-secondary",
      subtle: "ui-button-subtle",
      chip: "ui-button-chip",
      accent: "ui-button-accent",
      destructive: "ui-button-destructive",
      ghost: "ui-button-ghost",
      navigation: "ui-button-navigation",
      option: "ui-button-option",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});
export type ButtonProps = ComponentPropsWithRef<"button"> &
  VariantProps<typeof buttonVariants>;
type Props = ButtonProps;
export function Button({ className, variant, size, ...props }: Props) {
  return (
    <ButtonPrimitive
      {...props}
      data-slot="button"
      className={clsx(buttonVariants({ variant, size }), className)}
    />
  );
}
