import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "group/alert relative w-full overflow-hidden rounded-md border bg-background text-foreground shadow-sm [&>svg]:absolute [&>svg]:left-3 [&>svg]:top-3 [&>svg]:z-10 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-white",
  {
    variants: {
      variant: {
        default: "alert-info border-blue-600/30",
        info: "alert-info border-blue-600/30",
        success: "alert-success border-emerald-600/30",
        warning: "alert-warning border-amber-600/30",
        destructive: "alert-destructive border-red-600/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5
      ref={ref}
      className={cn(
        "m-0 min-h-10 px-4 py-2.5 pl-10 text-sm font-semibold leading-5 text-white",
        "group-[.alert-info]/alert:bg-blue-600 group-[.alert-success]/alert:bg-emerald-600 group-[.alert-warning]/alert:bg-amber-600 group-[.alert-destructive]/alert:bg-red-600",
        className,
      )}
      {...props}
    />
  ),
);
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("px-4 py-3 text-sm text-muted-foreground [&_p]:leading-relaxed", className)} {...props} />
  ),
);
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
