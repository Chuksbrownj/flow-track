import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const positive = status === "active" || status === "present";
  return (
    <Badge
      variant="outline"
      className={`border-transparent ${
        positive ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
      } ${className ?? ""}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}
