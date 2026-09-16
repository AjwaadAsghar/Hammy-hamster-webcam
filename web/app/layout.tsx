import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://hammy-hamster-webcam-six.vercel.app"),
  title: "Happy Birthday Stinky",
  description: "Pull faces, a hamster reacts live.",
  openGraph: {
    title: "Happy Birthday Stinky",
    description: "Pull faces, a hamster reacts live.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Happy Birthday Stinky",
    description: "Pull faces, a hamster reacts live.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
