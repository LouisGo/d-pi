// Adapted structure: shadcn-ui/ui Base Button, MIT, 98a1fe67b439324ddc857f47fbdce056600a4329.
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import type { ComponentPropsWithRef } from "react";

const buttonVariants = cva("ui-button", {
  variants: {
    size: { default: "", icon: "ui-button-icon" },
    variant: {
      default: "ui-button-primary",
      ghost: "ui-button-ghost",
      navigation: "ui-button-navigation",
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
