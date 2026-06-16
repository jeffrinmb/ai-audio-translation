import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Conference Translation',
  description: 'Real-time AI-powered conference translation platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50">
        {children}
      </body>
    </html>
  );
}
