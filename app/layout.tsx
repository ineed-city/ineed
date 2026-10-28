import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "iNeed",
  description: "Your everyday concierge: useful answers, sourced options, and a clear next step.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ro" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
