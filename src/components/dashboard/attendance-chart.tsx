"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type AttendancePoint = {
  day: string;
  present: number;
  absent: number;
};

export function AttendanceChart({ data }: { data: AttendancePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} barSize={24} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--outline-variant)" opacity={0.2} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: "var(--on-surface-variant)" }}
          interval="preserveStartEnd"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          width={32}
          tick={{ fontSize: 12, fill: "var(--on-surface-variant)" }}
        />
        <Tooltip
          contentStyle={{
            borderRadius: "12px",
            border: "1px solid var(--outline-variant)",
            background: "var(--surface-container-lowest)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
            fontSize: "13px",
          }}
          cursor={{ fill: "var(--surface-container-low)" }}
        />
        <Bar dataKey="present" name="Present" fill="var(--primary, #00685f)" radius={[6, 6, 0, 0]} />
        <Bar dataKey="absent" name="Absent" fill="var(--gold, #fdc425)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
