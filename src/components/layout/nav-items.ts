import {
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  IdCard,
  LayoutDashboard,
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
  { href: "/staff", label: "Staff", icon: UserCircle },
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
  { href: "/settings", label: "Settings", icon: Settings },
];

export const traineeNavItems = [
  { href: "/portal", label: "My dashboard", icon: UserCircle },
  { href: "/attendance", label: "Attendance", icon: ClipboardCheck },
  { href: "/schedule", label: "Training Schedule", icon: CalendarDays },
  { href: "/assessments", label: "Assessments", icon: GraduationCap },
  { href: "/profile", label: "Profile", icon: IdCard },
];
