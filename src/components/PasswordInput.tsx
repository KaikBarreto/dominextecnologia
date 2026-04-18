import { useState, forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** The original password to compare against (used in confirm fields) */
  matchAgainst?: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, matchAgainst, ...props }, ref) => {
    const [show, setShow] = useState(false);

    const value = (props.value as string) ?? "";
    const showMatchIndicator = matchAgainst !== undefined && value.length > 0;
    const isMatch = matchAgainst !== undefined && value === matchAgainst;

    return (
      <div className="space-y-1">
        <div className="relative">
          <Input
            ref={ref}
            {...props}
            type={show ? "text" : "password"}
            className={cn("pr-10", className)}
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShow(!show)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {showMatchIndicator && (
          <p className={cn("text-xs flex items-center gap-1", isMatch ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
            {isMatch ? "✓ As senhas coincidem" : "✗ As senhas não coincidem"}
          </p>
        )}
      </div>
    );
  }
);

PasswordInput.displayName = "PasswordInput";
