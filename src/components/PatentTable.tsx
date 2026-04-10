"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Fuse from "fuse.js";

import type { StatusValue, TableRow } from "@/lib/types";
import {
  classNames,
  downloadCsv,
  formatDate,
  statusLabel,
  statusPillClass,
} from "@/lib/utils";

type SortKey =
  | "normalized_number"
  | "title"
  | "status"
  | "country"
  | "product_line"
  | "filing_date"
  | "grant_date"
  | "expiration_date";

interface Props {
  rows: TableRow[];
}

const STATUS_OPTIONS: StatusValue[] = [
  "active",
  "pending",
  "expired",
  "dead",
  "unknown",
];

const PAGE_SIZE = 50;

export default function PatentTable({ rows }: Props) {
  const [query, setQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<Set<StatusValue>>(
    new Set(),
  );
  const [selectedProductLines, setSelectedProductLines] = useState<
    Set<string>
  >(new Set());
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(
    new Set(),
  );
  const [sortKey, setSortKey] = useState<SortKey>("filing_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  // Build facet options from the full dataset.
  const productLines = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.product_line) s.add(r.product_line);
    return Array.from(s).sort();
  }, [rows]);

  const countries = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.country) s.add(r.country);
    return Array.from(s).sort();
  }, [rows]);

  // Fuse.js index (title + inventors + number + product line + model).
  const fuse = useMemo(
    () =>
      new Fuse(rows, {
        keys: [
          { name: "title", weight: 2 },
          { name: "normalized_number", weight: 2 },
          { name: "raw_number", weight: 1 },
          { name: "inventors", weight: 1 },
          { name: "product_line", weight: 1 },
          { name: "model", weight: 1 },
          { name: "assignee", weight: 1 },
        ],
        threshold: 0.35,
        ignoreLocation: true,
        includeScore: false,
      }),
    [rows],
  );

  const filtered = useMemo(() => {
    let base: TableRow[];
    if (query.trim()) {
      base = fuse.search(query).map((r) => r.item);
    } else {
      base = rows;
    }

    return base.filter((r) => {
      if (selectedStatus.size && !selectedStatus.has(r.status)) return false;
      if (
        selectedProductLines.size &&
        (!r.product_line || !selectedProductLines.has(r.product_line))
      )
        return false;
      if (
        selectedCountries.size &&
        (!r.country || !selectedCountries.has(r.country))
      )
        return false;
      return true;
    });
  }, [rows, fuse, query, selectedStatus, selectedProductLines, selectedCountries]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = (a[sortKey] ?? "") as string;
      const bv = (b[sortKey] ?? "") as string;
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const visible = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir("asc");
    }
    setPage(0);
  };

  const toggleInSet = <T,>(s: Set<T>, v: T): Set<T> => {
    const next = new Set(s);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };

  const clearFilters = () => {
    setQuery("");
    setSelectedStatus(new Set());
    setSelectedProductLines(new Set());
    setSelectedCountries(new Set());
    setPage(0);
  };

  const hasFilters =
    query !== "" ||
    selectedStatus.size > 0 ||
    selectedProductLines.size > 0 ||
    selectedCountries.size > 0;

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* --- Filter panel --- */}
      <aside className="w-full shrink-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:w-64">
        <div className="mb-4">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Search
          </label>
          <input
            type="text"
            placeholder="title, number, inventor…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-sloan-500 focus:outline-none focus:ring-1 focus:ring-sloan-500"
          />
        </div>

        <FilterGroup
          label="Status"
          options={STATUS_OPTIONS}
          selected={selectedStatus}
          onToggle={(v) => {
            setSelectedStatus((s) => toggleInSet(s, v as StatusValue));
            setPage(0);
          }}
          format={(v) => statusLabel(v as StatusValue)}
        />

        <FilterGroup
          label="Product line"
          options={productLines}
          selected={selectedProductLines}
          onToggle={(v) => {
            setSelectedProductLines((s) => toggleInSet(s, v));
            setPage(0);
          }}
          maxHeight={180}
        />

        <FilterGroup
          label="Country"
          options={countries}
          selected={selectedCountries}
          onToggle={(v) => {
            setSelectedCountries((s) => toggleInSet(s, v));
            setPage(0);
          }}
          maxHeight={180}
        />

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Clear filters
          </button>
        )}
      </aside>

      {/* --- Table --- */}
      <div className="flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="text-sm text-slate-600">
            Showing{" "}
            <span className="font-semibold text-slate-900">
              {sorted.length.toLocaleString()}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-slate-900">
              {rows.length.toLocaleString()}
            </span>{" "}
            patents
          </div>
          <button
            onClick={() =>
              downloadCsv(
                `sloan-patents-${new Date().toISOString().slice(0, 10)}.csv`,
                sorted,
              )
            }
            className="rounded-md bg-sloan-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sloan-700"
          >
            Export CSV ({sorted.length.toLocaleString()})
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <Th
                  label="Number"
                  k="normalized_number"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={toggleSort}
                />
                <Th
                  label="Title"
                  k="title"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={toggleSort}
                />
                <Th
                  label="Status"
                  k="status"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={toggleSort}
                />
                <Th
                  label="Country"
                  k="country"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={toggleSort}
                />
                <Th
                  label="Product line"
                  k="product_line"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={toggleSort}
                />
                <Th
                  label="Filed"
                  k="filing_date"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={toggleSort}
                />
                <Th
                  label="Granted"
                  k="grant_date"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={toggleSort}
                />
                <Th
                  label="Expires"
                  k="expiration_date"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={toggleSort}
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-700">
                    <Link
                      href={`/patents/${r.id}`}
                      className="text-sloan-600 hover:underline"
                    >
                      {r.normalized_number ?? r.raw_number ?? "—"}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/patents/${r.id}`}
                      className="text-slate-900 hover:underline"
                    >
                      {r.title ?? "—"}
                    </Link>
                    {r.inventors.length > 0 && (
                      <div className="text-xs text-slate-500">
                        {r.inventors.slice(0, 3).join(", ")}
                        {r.inventors.length > 3 &&
                          ` +${r.inventors.length - 3}`}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={statusPillClass(r.status)}>
                      {statusLabel(r.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {r.country ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {r.product_line ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                    {formatDate(r.filing_date)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                    {formatDate(r.grant_date)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                    {formatDate(r.expiration_date)}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-8 text-center text-sm text-slate-500"
                  >
                    No patents match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* --- Pagination --- */}
        {pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
            <div>
              Page {page + 1} of {pageCount}
            </div>
            <div className="flex gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //

function Th({
  label,
  k,
  sortKey,
  sortDir,
  onClick,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onClick: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th
      onClick={() => onClick(k)}
      className={classNames(
        "cursor-pointer select-none px-3 py-2 text-left font-medium",
        active && "text-sloan-700",
      )}
    >
      {label}
      {active && (sortDir === "asc" ? " ▲" : " ▼")}
    </th>
  );
}

function FilterGroup({
  label,
  options,
  selected,
  onToggle,
  format,
  maxHeight,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (v: string) => void;
  format?: (v: string) => string;
  maxHeight?: number;
}) {
  return (
    <div className="mb-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </span>
        {selected.size > 0 && (
          <span className="text-xs text-sloan-600">{selected.size}</span>
        )}
      </div>
      <div
        className="space-y-1 overflow-y-auto pr-1"
        style={maxHeight ? { maxHeight } : undefined}
      >
        {options.map((o) => (
          <label
            key={o}
            className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"
          >
            <input
              type="checkbox"
              checked={selected.has(o)}
              onChange={() => onToggle(o)}
              className="h-4 w-4 rounded border-slate-300 text-sloan-600 focus:ring-sloan-500"
            />
            {format ? format(o) : o}
          </label>
        ))}
      </div>
    </div>
  );
}
