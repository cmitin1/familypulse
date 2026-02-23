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
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <Script
          id="telegram-theme-bridge"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var tg = window.Telegram && window.Telegram.WebApp;
                if (!tg || !tg.themeParams) return;
                var root = document.documentElement;
                var p = tg.themeParams;
                if (p.bg_color) root.style.setProperty('--tg-bg', p.bg_color);
                if (p.text_color) root.style.setProperty('--tg-text', p.text_color);
                if (p.secondary_bg_color) root.style.setProperty('--tg-secondary-bg', p.secondary_bg_color);
              })();
            `
          }}
        />
      </head>
      <body>
        <main className="mx-auto min-h-screen max-w-xl px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4">
          {children}
        </main>
      </body>
    </html>
  );
}
