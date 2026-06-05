import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

interface SubmitButtonProps {
  pendingText: string;
  icon: ReactNode;
  children: ReactNode;
}

export function SubmitButton({ pendingText, icon, children }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-primary text-primary-foreground group hover:bg-primary/80 inline-flex w-full items-center justify-center gap-3 px-5 py-3 text-sm font-medium tracking-[0.08em] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <span className="border-background/30 border-t-background size-3.5 animate-spin rounded-full border-2" />
          {pendingText}
        </span>
      ) : (
        <span className="flex items-center gap-2">
          {icon}
          {children}
          <span className="bg-primary text-primary-foreground -mr-2 ml-auto inline-flex h-5 w-5 items-center justify-center text-[0.625rem]">
            →
          </span>
        </span>
      )}
    </button>
  );
}
