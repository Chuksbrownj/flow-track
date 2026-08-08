export function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <span className="text-sm font-bold">FT</span>
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold">FlowTrack</p>
        <p className="text-[11px] text-muted-foreground">OYA / HYPREP</p>
      </div>
    </div>
  );
}
