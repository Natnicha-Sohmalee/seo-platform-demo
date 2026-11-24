import type { Metadata } from "next";
import { Anuphan, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const anuphan = Anuphan({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-thai",
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "SEO Platform",
  description: "แพลตฟอร์มวางแผนเนื้อหาและวิเคราะห์ SEO สำหรับธุรกิจไทย",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      className={`h-full antialiased ${anuphan.variable} ${plusJakarta.variable}`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
