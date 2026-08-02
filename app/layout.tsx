import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Rajdhani, JetBrains_Mono } from "next/font/google";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";

const chakra = Chakra_Petch({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-chakra",
});

const rajdhani = Rajdhani({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-rajdhani",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "Vreka",
  description: "Personal command center — keuangan, kerjaan, pelajaran.",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Vreka" },
};

export const viewport: Viewport = {
  themeColor: "#05080d",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={`${chakra.variable} ${rajdhani.variable} ${jetbrains.variable}`}>
      <body className="bg-void text-slate-200 font-body min-h-screen">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
