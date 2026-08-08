import { Card, CardContent } from "@/components/ui/card";

export function PagePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardContent className="flex items-center justify-center p-12 text-sm text-muted-foreground">
          This module is being built.
        </CardContent>
      </Card>
    </div>
  );
}
