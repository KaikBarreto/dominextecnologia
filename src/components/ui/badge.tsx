import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary hover:text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-white hover:bg-destructive hover:text-white",
        outline: "text-foreground hover:text-foreground",
        // Saturated color variants with white text - same color on hover
        success: "border-transparent bg-success text-white hover:bg-success hover:text-white",
        warning: "border-transparent bg-warning text-white hover:bg-warning hover:text-white",
        info: "border-transparent bg-info text-white hover:bg-info hover:text-white",
        muted: "border-transparent bg-muted-foreground text-white hover:bg-muted-foreground hover:text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
