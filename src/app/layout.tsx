import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Sloan Patent Portfolio Dashboard",
  description: "Internal IP portfolio dashboard for Sloan Valve Company",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans text-slate-900 antialiased">
        <Nav />
        <main className="mx-auto max-w-screen-2xl px-6 py-8">{children}</main>
        <footer className="mt-16 border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
          Sloan Valve Company — Internal Use Only
        </footer>
      </body>
    </html>
  );
}
