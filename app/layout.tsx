import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "iNeed",
  description: "Your everyday concierge: useful answers, sourced options, and a clear next step.",
  // Pe iPhone, deschisă de pe ecranul principal rulează pe tot ecranul.
  appleWebApp: { title: "iNeed", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#f7f8fa" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ro" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
