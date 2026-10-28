import { Instrument_Serif, Manrope } from "next/font/google";
import "./globals.css";

// Downloaded at build time and served by the app: the wall screen never calls Google.
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-serif", display: "swap" });
const sans = Manrope({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata = { title: "IT Service Desk" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`} suppressHydrationWarning /* browser extensions add attributes here */>
      <body>{children}</body>
    </html>
  );
}
