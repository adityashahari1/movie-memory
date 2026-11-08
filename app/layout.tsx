import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Movie Memory",
  description: "Movie Memory take-home application.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
