import type { Metadata, Viewport } from 'next';
import { PwaClient } from '@/components/pwa';
import './globals.css';

export const metadata: Metadata = {
  title: 'Our Family Home',
  description: 'A private home for our family — directory, events, and the Mission Fund.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#0f766e',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased bg-stone-50 text-stone-900 min-h-dvh">
        <PwaClient />
        {children}
      </body>
    </html>
  );
}
