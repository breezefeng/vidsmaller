import { siteConfig } from "@/config/site";
import "@/styles/globals.css";
import { Analytics } from "@vercel/analytics/next";
import { Viewport } from "next";

export const viewport: Viewport = {
  themeColor: siteConfig.themeColors,
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {process.env.NODE_ENV === "development" ? null : (
          <>{process.env.VERCEL_ENV ? <Analytics /> : null}</>
        )}
      </body>
    </html>
  );
}
