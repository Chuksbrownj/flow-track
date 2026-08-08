import {
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  IdCard,
  LayoutDashboard,
  Settings,
  UserCircle,
  Users,
} from "lucide-react";

export const adminNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trainees", label: "Trainees", icon: Users },
  { href: "/attendance", label: "Attendance", icon: ClipboardCheck },
  { href: "/assessments", label: "Assessments", icon: GraduationCap },
  { href: "/schedule", label: "Training Schedule", icon: CalendarDays },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const traineeNavItems = [
  { href: "/portal", label: "My dashboard", icon: UserCircle },
  { href: "/attendance", label: "Attendance", icon: ClipboardCheck },
  { href: "/profile", label: "Profile", icon: IdCard },
];
