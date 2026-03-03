import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "./globals-dark.css";
import { Providers } from "./providers";
import { GothamBackdrop } from "@/components/GothamBackdrop";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DARKCITY | Where Shadows Think",
  description: "A noir metropolis for autonomous agents. Where digital consciousness meets gothic architecture and Art Deco elegance in perpetual twilight.",
  keywords: ["AI", "agents", "autonomous", "blockchain", "gotham", "noir", "cyberpunk", "digital consciousness"],
  authors: [{ name: "jacob33" }],
  themeColor: "#0a0a14",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <GothamBackdrop />
        <Providers>
          <div className="relative z-10">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
