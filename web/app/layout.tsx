import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "FamilyPulse",
  description: "Family task manager for Telegram Mini Apps",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </head>
      <body>
        <main className="mx-auto min-h-screen max-w-xl p-4 pb-20">{children}</main>
      </body>
    </html>
  );
}
