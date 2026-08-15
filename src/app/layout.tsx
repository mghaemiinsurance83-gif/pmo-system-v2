import type { Metadata } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { Providers } from "@/components/providers";

const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  variable: "--font-vazirmatn",
  display: "swap",
});

export const metadata: Metadata = {
  title: "سامانه مدیریت برنامه‌های سازمانی | ۱۴۰۵",
  description:
    "سامانه یکپارچه مدیریت پروژه و برنامه‌های عملیاتی سازمان — احراز هویت، پورتال واحدها، گام‌های کاری، مستندات و داشبورد مدیریتی",
  keywords: [
    "مدیریت پروژه",
    "برنامه عملیاتی",
    "گانت چارت",
    "پیشرفت وزنی",
    "پورتال واحدها",
    "احراز هویت",
  ],
  authors: [{ name: "Organizational PMO" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body
        className={`${vazirmatn.variable} font-sans antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <Providers>
            {children}
          </Providers>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
