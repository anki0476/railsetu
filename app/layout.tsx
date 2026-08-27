import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import GlobalInteractionEffects from './components/global-interaction-effects';
import SiteSettings from './components/planner-settings';
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
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: "try{var t=localStorage.getItem('railsetu.theme.v1')||localStorage.getItem('railsetu.planner-theme.v1');if(t==='dark'){document.documentElement.classList.add('railsetu-dark');document.documentElement.style.colorScheme='dark'}}catch(e){}",
          }}
        />
      </head>
      <body className={`${geist.variable} antialiased`}>
        {children}
        <SiteSettings />
        <GlobalInteractionEffects />
      </body>
    </html>
  );
}
