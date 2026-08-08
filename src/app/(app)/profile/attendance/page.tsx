import { redirect } from "next/navigation";

// Attendance moved to its own top-level page at /attendance.
export default function OldAttendancePage() {
  redirect("/attendance");
}
