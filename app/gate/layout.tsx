import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "VANDOR — Akses terkunci",
};

export default function GateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background" suppressHydrationWarning>
      {children}
    </div>
  );
}
