"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // Avoid hydration mismatch: render nothing until mounted on the client.
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="relative"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {mounted ? (
        <>
          <Sun className="absolute h-4 w-4 scale-100 rotate-0 transition-all duration-300 dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute h-4 w-4 scale-0 rotate-90 transition-all duration-300 dark:scale-100 dark:rotate-0" />
        </>
      ) : (
        <span className="h-4 w-4" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
