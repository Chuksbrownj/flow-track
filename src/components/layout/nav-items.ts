import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Bell,
  GraduationCap,
  IdCard,
  LayoutDashboard,
  LifeBuoy,
  ScrollText,
  Settings,
  UserCircle,
  Users,
} from "lucide-react";

export const masterNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trainees", label: "Trainees", icon: Users },
  { href: "/attendance", label: "Attendance", icon: ClipboardCheck },
  { href: "/assessments", label: "Assessments", icon: GraduationCap },
  { href: "/schedule", label: "Training Schedule", icon: CalendarDays },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/audit", label: "Audit log", icon: ScrollText },
  { href: "/support", label: "Support", icon: LifeBuoy },
  { href: "/staff", label: "Staff", icon: UserCircle },
  { href: "/how-to-use", label: "How to Use", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const adminNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trainees", label: "Trainees", icon: Users },
  { href: "/attendance", label: "Attendance", icon: ClipboardCheck },
  { href: "/assessments", label: "Assessments", icon: GraduationCap },
  { href: "/schedule", label: "Training Schedule", icon: CalendarDays },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/audit", label: "Audit log", icon: ScrollText },
  { href: "/support", label: "Support", icon: LifeBuoy },
  { href: "/how-to-use", label: "How to Use", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const traineeNavItems = [
  { href: "/portal", label: "My dashboard", icon: UserCircle },
  { href: "/attendance", label: "Attendance", icon: ClipboardCheck },
  { href: "/schedule", label: "Training Schedule", icon: CalendarDays },
  { href: "/assessments", label: "Assessments", icon: GraduationCap },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/profile", label: "Profile", icon: IdCard },
];
