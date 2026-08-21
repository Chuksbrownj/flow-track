"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, GraduationCap, Users, IdCard } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/portal", label: "Home", icon: Home },
  { href: "/assessments", label: "Exams", icon: GraduationCap },
  { href: "/notifications", label: "Users", icon: Users },
  { href: "/profile", label: "Profile", icon: IdCard },
];

export function MobileBottomNav({ unreadCount = 0 }: { unreadCount?: number }) {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 rounded-t-xl border-t border-outline-variant/20 bg-surface/90 backdrop-blur-lg shadow-md md:hidden">
      <div className="flex items-center justify-around py-3">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 text-xs font-medium transition-all active:scale-90",
                active ? "text-primary" : "text-on-surface-variant hover:text-primary"
              )}
            >
              <div className="relative">
                <tab.icon className="h-5 w-5" />
                {tab.href === "/notifications" && unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-error" />
                )}
              </div>
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
