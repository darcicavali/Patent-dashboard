import Link from "next/link";

interface AlertBannerProps {
  count: number;
}

export default function AlertBanner({ count }: AlertBannerProps) {
  if (count === 0) {
    return (
      <div className="mb-6 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
        No exceptions — everything is clean.
      </div>
    );
  }
  return (
    <div className="mb-6 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
      <div className="text-amber-900">
        <span className="font-semibold">{count.toLocaleString()}</span> items
        need review (assignees, missing data, orphans).
      </div>
      <Link
        href="/exceptions"
        className="font-medium text-amber-900 underline hover:text-amber-950"
      >
        Open Exception Report →
      </Link>
    </div>
  );
}
