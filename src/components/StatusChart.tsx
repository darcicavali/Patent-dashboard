"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface StatusChartProps {
  data: Record<string, number>;
}

const COLORS: Record<string, string> = {
  active: "#16a34a",
  pending: "#f59e0b",
  expired: "#64748b",
  dead: "#dc2626",
  unknown: "#eab308",
};

export default function StatusChart({ data }: StatusChartProps) {
  const rows = Object.entries(data).map(([name, value]) => ({ name, value }));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-semibold text-slate-700">
        Patents by status
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
            >
              {rows.map((r) => (
                <Cell
                  key={r.name}
                  fill={COLORS[r.name] ?? "#94a3b8"}
                  stroke="#fff"
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, name: string) => [
                value.toLocaleString(),
                name,
              ]}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
