'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';

import { KeyboardProvider } from '@/components/Keyboard/KeyboardProvider';
import { bootstrapAuth } from '@/lib/api';
import { useApplyTheme } from '@/lib/theme-store';

function ThemeApplier() {
  useApplyTheme();
  return null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  useEffect(() => {
    void bootstrapAuth();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeApplier />
      <KeyboardProvider>{children}</KeyboardProvider>
    </QueryClientProvider>
  );
}
