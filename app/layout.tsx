import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OfficeVerse — AI-Powered Virtual Company HQ",
  description: "Your Business. Your People. Your Universe.",
  applicationName: "OfficeVerse",
  // installed to the home screen on iPhone / iPad: full screen, own icon
  appleWebApp: { capable: true, title: "OfficeVerse", statusBarStyle: "black-translucent" },
  icons: { icon: [{ url: "/icon-192.png", sizes: "192x192" }], apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1e3a5f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-dvh overflow-hidden">{children}</body>
    </html>
  );
}
