import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ParkEasy - Smart Parking Management",
  description: "Production-grade multi-lot parking management with ANPR",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
