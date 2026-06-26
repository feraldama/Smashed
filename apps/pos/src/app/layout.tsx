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
      <head>
        {/* Aplica el tema oscuro antes del primer paint para evitar el flash
            de tema claro (FOUC). Lee la misma clave que `theme-store.ts`. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=JSON.parse(localStorage.getItem('smash-theme'));if(s&&s.state&&s.state.theme==='dark'){document.documentElement.classList.add('dark')}}catch(e){}`,
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <AppProviders>
          {children}
          <ToastContainer />
        </AppProviders>
      </body>
    </html>
  );
}
