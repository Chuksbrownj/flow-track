import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  let tone = "bg-destructive/10 text-destructive";
  if (status === "active" || status === "present") tone = "bg-primary/10 text-primary";
  if (status === "pending") tone = "bg-gold/20 text-gold-foreground";
  return (
    <Badge
      variant="outline"
      className={`border-transparent ${tone} ${className ?? ""}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}
