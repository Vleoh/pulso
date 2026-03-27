import type { Metadata } from "next";
import { Barlow_Condensed, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const headline = Barlow_Condensed({
  variable: "--font-headline",
  weight: ["500", "600", "700", "800"],
  subsets: ["latin"],
});

const body = Source_Sans_3({
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pulso Pais | Politica, Poder y Territorio",
  description:
    "Medio digital politico federal de Argentina. Agenda nacional, distrital y radar electoral con enfoque editorial premium.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${headline.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
