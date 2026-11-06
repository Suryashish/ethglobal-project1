import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const buttonStyles = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 disabled:pointer-events-none select-none cursor-pointer active:translate-y-px",
  {
    variants: {
      variant: {
        // ink on paper: the one thing to do on a screen
        primary:
          "bg-fg text-[#fbf8f2] shadow-[0_1px_0_rgb(255_255_255/0.12)_inset,0_1px_2px_rgb(29_27_23/0.25)] hover:bg-ink-soft disabled:bg-surface-2 disabled:text-faint disabled:shadow-none disabled:ring-1 disabled:ring-inset disabled:ring-line",
        secondary:
          "disabled:opacity-45 bg-field text-fg border border-line-strong shadow-[0_1px_1px_rgb(60_45_25/0.06)] hover:border-faint hover:bg-white",
        ghost: "disabled:opacity-45 text-muted hover:text-fg hover:bg-surface-2",
        danger: "disabled:opacity-45 bg-field text-danger border border-danger/35 hover:bg-danger/[0.06] hover:border-danger/60",
        // used for "open / release" moments
        success: "disabled:opacity-45 bg-released text-white hover:brightness-110",
        wax: "disabled:opacity-45 bg-sealed text-[#fdf3ef] shadow-[0_1px_0_rgb(255_255_255/0.15)_inset,0_1px_2px_rgb(120_30_20/0.35)] hover:bg-sealed-deep",
      },
      size: { sm: "h-8 px-3 text-[13px]", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-[15px]" },
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
