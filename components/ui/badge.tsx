import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", {
  variants: {
    variant: {
      default: "border-transparent bg-navy text-white",
      secondary: "border-transparent bg-slate-100 text-slate-700",
      outline: "border-slate-200 text-slate-600",
      demo: "border-amber-300 bg-amber-100 text-amber-900",
      success: "border-transparent bg-emerald-100 text-emerald-800",
      danger: "border-transparent bg-red-100 text-red-700",
      warning: "border-transparent bg-amber-100 text-amber-800",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
