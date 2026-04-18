import { useMemo } from "react";
import { Check, X } from "lucide-react";

interface PasswordStrengthIndicatorProps {
  password: string;
}

interface Requirement {
  label: string;
  met: boolean;
}

function getRequirements(password: string): Requirement[] {
  return [
    { label: "Pelo menos 8 caracteres", met: password.length >= 8 },
    { label: "Pelo menos 1 número", met: /\d/.test(password) },
    { label: "Pelo menos 1 letra minúscula", met: /[a-z]/.test(password) },
    { label: "Pelo menos 1 letra maiúscula", met: /[A-Z]/.test(password) },
    { label: "Pelo menos 1 caractere especial", met: /[^A-Za-z0-9]/.test(password) },
  ];
}

function getStrength(requirements: Requirement[]): { level: number; label: string } {
  const met = requirements.filter((r) => r.met).length;
  if (met <= 1) return { level: 0, label: "Senha fraca" };
  if (met <= 2) return { level: 1, label: "Senha fraca" };
  if (met <= 3) return { level: 2, label: "Senha média" };
  if (met <= 4) return { level: 3, label: "Senha boa" };
  return { level: 4, label: "Senha forte" };
}

const strengthColors = [
  "bg-destructive",
  "bg-destructive",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-emerald-600",
];

export function PasswordStrengthIndicator({ password }: PasswordStrengthIndicatorProps) {
  const requirements = useMemo(() => getRequirements(password), [password]);
  const strength = useMemo(() => getStrength(requirements), [requirements]);

  if (!password) return null;

  const segments = 4;
  const filledSegments = strength.level;

  return (
    <div className="space-y-2 mt-2">
      <div className="flex gap-1 h-1.5">
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 rounded-full transition-colors duration-300 ${
              i < filledSegments ? strengthColors[strength.level] : "bg-muted"
            }`}
          />
        ))}
      </div>
      <p className="text-xs font-medium text-foreground">
        {strength.label}. Deve conter:
      </p>
      <ul className="space-y-0.5">
        {requirements.map((req) => (
          <li key={req.label} className="flex items-center gap-2 text-xs">
            {req.met ? (
              <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            ) : (
              <X className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            <span className={req.met ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
              {req.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Helper: returns true if password meets minimum (8 chars + at least 3 of 4 categories) */
export function isPasswordStrong(password: string): boolean {
  if (password.length < 8) return false;
  const categories = [/\d/, /[a-z]/, /[A-Z]/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  return categories >= 3;
}
