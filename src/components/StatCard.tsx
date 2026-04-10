import { classNames } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "warning" | "success" | "danger";
}

export default function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: StatCardProps) {
  return (
    <div
      className={classNames(
        "rounded-lg border border-slate-200 bg-white p-4 shadow-sm",
        tone === "warning" && "border-amber-200 bg-amber-50",
        tone === "success" && "border-green-200 bg-green-50",
        tone === "danger" && "border-red-200 bg-red-50",
      )}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}
