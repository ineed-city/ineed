import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "iNeed",
  description: "Ajutor AI pentru reparații și lucrări în casă",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ro" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
