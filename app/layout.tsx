import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'RailSetu — A better way through the waitlist',
  description: 'Passenger-aware confirmed journey planning for waitlisted train routes.',
  openGraph: {
    title: 'RailSetu — A better way through the waitlist',
    description: 'Passenger-aware confirmed journey planning for waitlisted train routes.',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RailSetu — A better way through the waitlist',
    description: 'Passenger-aware confirmed journey planning for waitlisted train routes.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body className={`${geist.variable} antialiased`}>{children}</body>
    </html>
  );
}
