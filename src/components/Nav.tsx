"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { classNames } from "@/lib/utils";

const links = [
  { href: "/", label: "Overview" },
  { href: "/patents", label: "Patents" },
  { href: "/exceptions", label: "Exceptions" },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="h-8 w-8 rounded bg-sloan-600" />
          <div>
            <div className="text-sm font-semibold tracking-tight text-slate-900">
              Sloan Patent Portfolio
            </div>
            <div className="text-xs text-slate-500">Internal dashboard</div>
          </div>
        </Link>

        <nav className="flex items-center gap-1">
          {links.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={classNames(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition",
                  active
                    ? "bg-sloan-50 text-sloan-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
