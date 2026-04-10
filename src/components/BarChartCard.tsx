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

interface BarChartCardProps {
  title: string;
  xKey: string;
  yKey: string;
  data: Array<Record<string, string | number>>;
  fill?: string;
  height?: number;
  angle?: number;
}

export default function BarChartCard({
  title,
  xKey,
  yKey,
  data,
  fill = "#1f5aa6",
  height = 260,
  angle = -25,
}: BarChartCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-semibold text-slate-700">{title}</div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey={xKey}
              tick={{ fontSize: 11 }}
              interval={0}
              angle={angle}
              textAnchor="end"
              height={60}
            />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value: number) => value.toLocaleString()}
              labelStyle={{ color: "#0f172a" }}
            />
            <Bar dataKey={yKey} fill={fill} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
