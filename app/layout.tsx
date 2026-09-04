import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import { ConvexClientProvider } from "./ConvexClientProvider";
import "./globals.css";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-aevia-sans" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-aevia-display" });

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
    <html lang="en" className={`${dmSans.variable} ${fraunces.variable}`}>
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
