import {
  GraduationCap,
  IdCard,
  LayoutDashboard,
  Settings,
  UserCircle,
  Users,
} from "lucide-react";

export const masterNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trainees", label: "Trainees", icon: Users },
  { href: "/assessments", label: "Examinations", icon: GraduationCap },
  { href: "/staff", label: "Staff", icon: UserCircle },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const adminNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trainees", label: "Trainees", icon: Users },
  { href: "/assessments", label: "Examinations", icon: GraduationCap },
  { href: "/staff", label: "Staff", icon: UserCircle },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const traineeNavItems = [
  { href: "/portal", label: "Dashboard", icon: LayoutDashboard },
  { href: "/assessments", label: "Exams", icon: GraduationCap },
  { href: "/notifications", label: "Users", icon: Users },
  { href: "/profile", label: "Profile", icon: IdCard },
];
