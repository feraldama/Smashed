import { Inter } from 'next/font/google';

import type { Metadata } from 'next';

import { AppProviders } from '@/providers/AppProviders';

import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Smash KDS',
  description: 'Kitchen Display System — Smash Burgers Paraguay',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PY" suppressHydrationWarning className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
