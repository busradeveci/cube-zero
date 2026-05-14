import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CubeZero — Finansal Geleceğinin Otonom Koruyucusu",
  description:
    "E-ticaret gürültüsünden korunan, otonom finansal karar kalkanı. Kart verisi yok; yalnızca manuel limit ve profil.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="tr"
      className={`${inter.variable} ${jetbrains.variable} overflow-x-hidden bg-cube-bg`}
    >
      <body className="min-h-screen overflow-x-hidden bg-cube-bg font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
