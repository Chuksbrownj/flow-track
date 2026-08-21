import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  title,
  value,
  icon: Icon,
  hint,
  hintIcon,
  hintColor,
}: {
  title: string;
  value: number | string;
  icon: LucideIcon;
  hint?: string;
  hintIcon?: "up" | "down";
  hintColor?: "default" | "destructive";
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
          {hint && (
            <p className={cn(
              "text-xs mt-1",
              hintColor === "destructive" ? "text-destructive" : "text-muted-foreground"
            )}>
              {hintIcon === "up" && <span className="mr-1">↑</span>}
              {hintIcon === "down" && <span className="mr-1">↓</span>}
              {hint}
            </p>
          )}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
