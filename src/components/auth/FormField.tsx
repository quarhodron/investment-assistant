import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const inputBase =
  "block w-full border bg-background px-3 py-2.5 pl-10 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0";

interface FormFieldProps {
  id: string;
  name?: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: ReactNode;
  icon: ReactNode;
  endContent?: ReactNode;
}

export function FormField({
  id,
  name,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  hint,
  icon,
  endContent,
}: FormFieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-muted-foreground mb-1.5 block text-xs font-medium tracking-[0.16em] uppercase"
      >
        {label}
      </label>
      <div className="relative">
        <span className="text-muted-foreground/70 pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
          {icon}
        </span>
        <input
          id={id}
          name={name ?? id}
          type={type}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          placeholder={placeholder}
          className={cn(
            inputBase,
            error
              ? "border-destructive/70 focus:ring-destructive/40"
              : "border-border focus:border-foreground focus:ring-ring/50",
          )}
        />
        {endContent}
      </div>
      {error ? (
        <p className="text-destructive mt-1.5 flex items-center gap-1.5 text-xs">
          <CircleAlert className="size-3" />
          {error}
        </p>
      ) : (
        hint
      )}
    </div>
  );
}
