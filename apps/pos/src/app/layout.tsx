import { Inter } from 'next/font/google';

import type { Metadata } from 'next';

import { ToastContainer } from '@/components/Toast';
import { AppProviders } from '@/providers/AppProviders';

import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Smash POS',
  description: 'Punto de venta — Smash Burgers Paraguay',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PY" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <AppProviders>
          {children}
          <ToastContainer />
        </AppProviders>
      </body>
    </html>
  );
}
