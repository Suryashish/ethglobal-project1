import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none select-none cursor-pointer",
  {
    variants: {
      variant: {
        primary: "bg-sealed text-[#1a1203] hover:bg-[#ffbb55]",
        secondary: "bg-surface-2 text-fg border border-line hover:border-[#3a3a42]",
        ghost: "text-muted hover:text-fg hover:bg-surface-2",
        danger: "bg-danger/10 text-danger border border-danger/40 hover:bg-danger/20",
        success: "bg-released text-[#04130c] hover:bg-[#5ddba0]",
      },
      size: { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base" },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonStyles>) {
  return <button type="button" className={cn(buttonStyles({ variant, size }), className)} {...props} />;
}
