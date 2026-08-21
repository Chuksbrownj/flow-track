import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  let tone = "bg-destructive/10 text-destructive";
  if (status === "active" || status === "present") tone = "bg-emerald-100 text-emerald-700";
  if (status === "pending") tone = "bg-amber-100 text-amber-700";
  if (status === "dormant") tone = "bg-orange-100 text-orange-700";
  if (status === "deleted") tone = "bg-destructive/10 text-destructive line-through";
  let label = status.charAt(0).toUpperCase() + status.slice(1);
  if (status === "dormant") label = "Dormant";
  return (
    <Badge
      variant="outline"
      className={`border-transparent ${tone} ${className ?? ""}`}
    >
      {label}
    </Badge>
  );
}
