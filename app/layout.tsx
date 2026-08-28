import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import GlobalInteractionEffects from './components/global-interaction-effects';
import SiteSettings from './components/planner-settings';
import { SiteLanguageProvider } from './components/site-language';
import './globals.css';

const geist = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'RailSetu — A better way through the waitlist',
  description: 'Passenger-aware confirmed journey planning for waitlisted train routes.',
  icons: {
    icon: '/railsetu-logo.png',
    shortcut: '/railsetu-logo.png',
    apple: '/railsetu-logo.png',
  },
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
            __html: "try{var t=localStorage.getItem('railsetu.theme.v1')||localStorage.getItem('railsetu.planner-theme.v1');if(t==='dark'){document.documentElement.classList.add('railsetu-dark');document.documentElement.style.colorScheme='dark'}var l=localStorage.getItem('railsetu.language.v1');if(l==='hi'){document.documentElement.lang='hi-IN';document.documentElement.classList.add('railsetu-hindi')}}catch(e){}",
          }}
        />
      </head>
      <body className={`${geist.variable} antialiased`}>
        <SiteLanguageProvider>
          {children}
          <SiteSettings />
          <GlobalInteractionEffects />
        </SiteLanguageProvider>
      </body>
    </html>
  );
}
