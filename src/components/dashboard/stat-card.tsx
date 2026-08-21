import type { LucideIcon } from "lucide-react";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  title,
  value,
  icon: Icon,
  hint,
  hintIcon,
  hintColor = "default",
}: {
  title: string;
  value: number | string;
  icon: LucideIcon;
  hint?: string;
  hintIcon?: "up" | "down";
  hintColor?: "default" | "destructive" | "gold";
}) {
  const IconEl = hintIcon === "up" ? ArrowUp : hintIcon === "down" ? ArrowDown : null;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-5 shadow-sm transition-colors hover:border-primary/30">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">{title}</p>
        <Icon className="h-5 w-5 shrink-0 text-primary/40" />
      </div>
      <p className="mt-1 text-2xl font-bold text-on-surface tabular-nums tracking-tight">{value}</p>
      {hint && (
        <p className={cn(
          "mt-2 flex items-center gap-1 text-xs font-medium",
          hintColor === "destructive" ? "text-error" : hintColor === "gold" ? "text-secondary" : "text-primary"
        )}>
          {IconEl && <IconEl className="h-3 w-3" />}
          {!IconEl && !hintIcon && <Minus className="h-3 w-3" />}
          {hint}
        </p>
      )}
      <div className="pointer-events-none absolute -right-4 -bottom-4 h-16 w-16 rounded-full bg-primary/5 blur-xl transition-colors group-hover:bg-primary/10" />
    </div>
  );
}
