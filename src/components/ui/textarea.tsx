import * as React from "react";

import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "app-ui-textarea flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-[length:var(--app-ui-control-font-size,14px)] ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
