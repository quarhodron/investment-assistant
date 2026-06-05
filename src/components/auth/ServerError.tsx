import { CircleAlert } from "lucide-react";

interface ServerErrorProps {
  message?: string | null;
}

export function ServerError({ message }: ServerErrorProps) {
  if (!message) return null;

  return (
    <p
      role="alert"
      className="border-destructive/40 text-destructive flex items-start gap-2 border-l-2 bg-[color-mix(in_oklch,var(--destructive)_8%,transparent)] px-3 py-2.5 text-sm"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}
