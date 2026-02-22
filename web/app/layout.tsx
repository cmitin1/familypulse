import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FamilyPulse Mini App",
  description: "Family task manager for Telegram Mini Apps"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <main className="mx-auto max-w-xl p-4">{children}</main>
      </body>
    </html>
  );
}
