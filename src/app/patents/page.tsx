import PatentTable from "@/components/PatentTable";
import { getTableRows } from "@/lib/data";

export const metadata = {
  title: "Patents — Sloan Patent Dashboard",
};

export default function PatentsPage() {
  const rows = getTableRows();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Patents
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Search, filter, and export the full portfolio.
        </p>
      </div>
      <PatentTable rows={rows} />
    </div>
  );
}
