import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DatePicker } from "./DatePicker";

/** Adaptador do seletor de data padrão para formulários administrativos. */
export function DateField({
  value,
  onChange,
  id,
  label,
  min,
  max,
  disabled,
  required,
  placeholder = "dd/mm/aaaa",
  className,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  id?: string;
  label?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <DatePicker id={id} value={value ?? ""} min={min} max={max} disabled={disabled} clearable={!required} placeholder={placeholder} onValueChange={onChange} />
    </div>
  );
}
