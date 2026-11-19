import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-[13px] font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer select-none",
  {
    variants: {
      variant: {
        primary: "bg-navy-900 text-white hover:bg-navy-800",
        brand: "bg-brand-500 text-navy-950 hover:bg-brand-400",
        outline: "border border-line-strong bg-surface text-ink hover:bg-subtle",
        ghost: "text-muted hover:bg-subtle hover:text-ink",
        danger: "border border-danger-600/30 bg-surface text-danger-600 hover:bg-danger-50",
        link: "h-auto px-0 text-teal-600 hover:underline underline-offset-4",
        navy: "bg-navy-900 text-white hover:bg-navy-800",
      },
      size: {
        sm: "h-8 px-2.5",
        md: "h-9 px-3.5",
        lg: "h-11 px-5 text-sm",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
