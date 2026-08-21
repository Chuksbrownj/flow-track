import { requireStaff } from "@/lib/auth-guard";
import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  FileQuestion,
  GraduationCap,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
  UserCircle,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "How to Use" };

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">{children}</CardContent>
    </Card>
  );
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
      <span>{children}</span>
    </li>
  );
}

export default async function HowToUsePage() {
  const user = await requireStaff();
  const isMaster = user.role === "master_admin";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">How to Use</h1>
        <p className="text-sm text-muted-foreground">
          A quick guide to the FlowTrack staff portal{isMaster ? " (master admin)" : " (admin / trainer)"}.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Section icon={LayoutDashboard} title="Getting around">
          <ul className="space-y-2">
            <Item>Use the menu on the left to move between modules. On a phone, open it with the menu button at the top.</Item>
            <Item>Your course badge appears next to the page title — that is the course you manage as a trainer.</Item>
            <Item>Use the theme toggle (top right) to switch between light and dark mode.</Item>
          </ul>
        </Section>

        <Section icon={ClipboardCheck} title="Attendance (Mon / Wed / Fri)">
          <ul className="space-y-2">
            <Item>Students self check-in on training days. Their submissions appear as <strong>Pending</strong>.</Item>
            <Item>Open Attendance → confirm or reject each pending check-in, or mark any student present/absent manually.</Item>
            <Item>Anyone not marked present by the end of a training day is automatically marked absent.</Item>
          </ul>
        </Section>

        <Section icon={GraduationCap} title="Score sheet">
          <ul className="space-y-2">
            <Item>Assessments → Score sheet: pick a course tab and enter each week&apos;s score out of 100 in its column (use Add week to backfill a missing week). Course total sums all weeks; the Grand total tab adds every course and shows an average %.</Item>
          </ul>
        </Section>

        <Section icon={FileQuestion} title="Exams — how to use">
          <ul className="space-y-2">
            <Item>Assessments → Exams: create a draft exam, then add questions one by one or upload a CSV, Excel, PDF, Word, Markdown or HTML file. Review the parsed questions (search, filter, edit, remove) before importing them.</Item>
            <Item>Preview shows the saved questions with their answer key anytime — while the exam is still a draft you can edit them from the preview; once it has started they are locked.</Item>
            <Item>Opening an exam asks for a closing time and notifies trainees. Exams run in full-screen: pressing Escape more than twice, or pressing Escape (leaving full-screen) and not returning within 10 seconds, auto-submits the exam. Trainees can stay on the screen for the full exam time — the 10-second clock only runs while they are out of full-screen.</Item>
            <Item>The Trainees button lists who is taking the exam. If a trainee&apos;s exam was auto-submitted, use Reopen next to their name to let them resume where they left off while the exam is still open.</Item>
            <Item>After submissions, grade written answers (Grade written), then Close the exam. A closed exam can be reopened if it was closed by mistake.</Item>
          </ul>
        </Section>

        <Section icon={Users} title="Trainees & suspensions">
          <ul className="space-y-2">
            <Item>Approve new registrations in Trainees.</Item>
            <Item>
              As an admin you can <strong>request</strong> a suspension — a master admin must confirm it before it takes effect.
            </Item>
            {isMaster ? (
              <>
                <Item>As a master admin you can suspend an account immediately (dormant), restore it, or mark it for permanent deletion (purged after 1 week).</Item>
                <Item>Re-registration with a deleted code is blocked and routed to the Contact Admin support form.</Item>
              </>
            ) : null}
          </ul>
        </Section>

        {isMaster ? (
          <Section icon={ShieldCheck} title="Master admin extras">
            <ul className="space-y-2">
              <Item>Promote any admin to master admin (Staff page).</Item>
              <Item>Confirm or reject suspension requests (Trainees page).</Item>
              <Item>Restore dormant accounts and permanently delete accounts.</Item>
              <Item>See the full audit log (Audit log page) — every action by students, admins and master admins.</Item>
              <Item>Add new courses (Settings) — they automatically appear as score sheet tabs and exam topics.</Item>
              <Item>Change an admin&apos;s course assignment after their self-selection (Staff page).</Item>
            </ul>
          </Section>
        ) : (
          <Section icon={UserCircle} title="As an admin (trainer)">
            <ul className="space-y-2">
              <Item>You picked your course on first login — it&apos;s locked. Ask the master admin to change it.</Item>
              <Item>You can manage attendance, enter scores and create exams for your course, and run the training schedule.</Item>
              <Item>The audit log shows you student actions; the master admin sees everything.</Item>
            </ul>
          </Section>
        )}

        <Section icon={CalendarDays} title="Schedule & assignments">
          <ul className="space-y-2">
            <Item>Add training sessions in Training Schedule. Attach the Google Form link so students can submit work externally.</Item>
            <Item>Students see the schedule read-only with their Submit Assignment links.</Item>
          </ul>
        </Section>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-5 w-5 text-primary" />
            Need more help?
          </CardTitle>
          <CardDescription>Quick answers to common questions.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
          <p>
            <strong>Forgot your password?</strong> Use “Forgot password” on the staff login page, or
            ask the master admin to reset it from Staff.
          </p>
          <p>
            <strong>Attendance can&apos;t be changed?</strong> Records are editable for 72 hours after
            the day; older days are locked.
          </p>
          <p>
            <strong>Change your password</strong> any time from Settings.
          </p>
          <p>
            <strong>Is this portal mobile-friendly?</strong> Yes — every module works on phones.
          </p>
        </CardContent>
      </Card>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ScrollText className="h-4 w-4" />
        Every data-changing action in this portal is recorded in the audit log.
      </p>
    </div>
  );
}
