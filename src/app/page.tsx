import AlertBanner from "@/components/AlertBanner";
import BarChartCard from "@/components/BarChartCard";
import StatCard from "@/components/StatCard";
import StatusChart from "@/components/StatusChart";
import { getOverviewStats } from "@/lib/data";
import { formatDate } from "@/lib/utils";

export default function OverviewPage() {
  const stats = getOverviewStats();

  const productLineData = stats.byProductLine
    .slice(0, 10)
    .map((r) => ({ name: r.name, count: r.count }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Portfolio Overview
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Last refreshed {formatDate(stats.lastRefresh.slice(0, 10))}
        </p>
      </div>

      <AlertBanner count={stats.exceptionCount} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
        <StatCard label="Total patents" value={stats.total.toLocaleString()} />
        <StatCard
          label="Active"
          value={(stats.byStatus.active ?? 0).toLocaleString()}
          tone="success"
        />
        <StatCard
          label="Pending"
          value={(stats.byStatus.pending ?? 0).toLocaleString()}
          tone="warning"
        />
        <StatCard
          label="Expired"
          value={(stats.byStatus.expired ?? 0).toLocaleString()}
        />
        <StatCard
          label="Dead"
          value={(stats.byStatus.dead ?? 0).toLocaleString()}
          tone="danger"
        />
        <StatCard label="Families" value={stats.familyCount.toLocaleString()} />
        <StatCard
          label="Jurisdictions"
          value={stats.jurisdictionCount.toLocaleString()}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StatusChart data={stats.byStatus} />
        <BarChartCard
          title="Patents by product line (top 10)"
          xKey="name"
          yKey="count"
          data={productLineData}
          fill="#1f5aa6"
        />
      </div>

      <BarChartCard
        title="Patents by decade of filing"
        xKey="decade"
        yKey="count"
        data={stats.byDecade}
        fill="#0ea5e9"
        height={220}
        angle={0}
      />

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 text-sm font-semibold text-slate-700">
          Merge summary
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Matched in both sources
            </div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">
              {stats.matchRate.matched.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              XLSX-only (newer)
            </div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">
              {stats.matchRate.xlsxOnly.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              CSV-only (historical)
            </div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">
              {stats.matchRate.csvOnly.toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
