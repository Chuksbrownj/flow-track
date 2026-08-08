export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <span className="text-lg font-bold">FT</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">FlowTrack</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Training management for the OYA / HYPREP Digital Skills Programme.
        </p>
        <p className="mt-6 text-sm text-muted-foreground">
          Set up your database and admin account, then sign in to get started.
        </p>
      </div>
    </main>
  );
}
