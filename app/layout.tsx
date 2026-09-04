import type { Metadata } from "next";
import { Newsreader, Plus_Jakarta_Sans } from "next/font/google";
import { ConvexClientProvider } from "./ConvexClientProvider";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-aevia-sans" });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-aevia-display" });

export const metadata: Metadata = {
  title: {
    default: "Aevia — Your personal household assistant",
    template: "%s · Aevia",
  },
  description:
    "Aevia remembers how your household works and handles the everyday follow-through.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jakarta.variable} ${newsreader.variable}`}>
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
