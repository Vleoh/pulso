import type { Metadata } from "next";
import { Inter, Newsreader, Work_Sans } from "next/font/google";
import "./globals.css";

const headline = Newsreader({
  variable: "--font-headline",
  weight: ["400", "500", "700", "800"],
  subsets: ["latin"],
});

const body = Work_Sans({
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const label = Inter({
  variable: "--font-label",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pulso Pais | Politica, Poder y Territorio",
  description:
    "Medio digital politico federal de Argentina. Agenda nacional, distrital y radar electoral con enfoque editorial premium.",
  icons: {
    icon: "/favicon.jpg",
    shortcut: "/favicon.jpg",
    apple: "/favicon.jpg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${headline.variable} ${body.variable} ${label.variable}`}>
      <body>{children}</body>
    </html>
  );
}
