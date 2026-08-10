"use client";

import * as React from "react";

type SidebarContextValue = {
  collapsed: boolean;
  toggle: () => void;
  collapse: () => void;
  expand: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

const STORAGE_KEY = "flowtrack:sidebar:collapsed";

// ---- persisted preference as an external store ----------------------------
// A tiny store around localStorage so the preference survives reloads without
// calling setState inside an effect (SSR-safe via the server snapshot).

let cached: boolean | null = null;
const listeners = new Set<() => void>();

function readStored(): boolean {
  if (cached === null) {
    try {
      cached = window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      cached = false;
    }
  }
  return cached;
}

function writeStored(value: boolean) {
  cached = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // ignore storage errors
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      cached = null; // re-read from storage
      listener();
    }
  };
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot() {
  return readStored();
}

function getServerSnapshot() {
  return false; // server always renders expanded to match the default
}
// ---------------------------------------------------------------------------

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const collapsed = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  const value = React.useMemo<SidebarContextValue>(
    () => ({
      collapsed,
      toggle: () => writeStored(!collapsed),
      collapse: () => writeStored(true),
      expand: () => writeStored(false),
    }),
    [collapsed]
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
