// Adapted structure: shadcn-ui/ui Base Button, MIT, 98a1fe67b439324ddc857f47fbdce056600a4329.
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";

const buttonVariants = cva("ui-button", {
  variants: {
    variant: { default: "ui-button-primary", ghost: "ui-button-ghost" },
  },
  defaultVariants: { variant: "default" },
});
type Props = ButtonPrimitive.Props & VariantProps<typeof buttonVariants>;
export function Button({ className, variant, ...props }: Props) {
  return (
    <ButtonPrimitive
      {...props}
      data-slot="button"
      className={clsx(buttonVariants({ variant }), className)}
    />
  );
}
