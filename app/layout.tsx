import type { Metadata } from 'next';
import { Inter_Tight, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter-tight',
  display: 'swap',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Creatools — Ferramentas criativas para creators',
  description:
    'Creatools: carrosséis, tweets, notícias e agenda de postagem em um só lugar. Criação assistida por IA com design brutalist e identidade forte.',
  icons: {
    icon: '/ICON_SEMFUNDO.png',
    shortcut: '/ICON_SEMFUNDO.png',
    apple: '/ICON_SEMFUNDO.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Preserva fontes que o editor de slides usa (catálogo) */}
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo+Black&family=Barlow+Condensed:wght@700;800&family=Bebas+Neue&family=Cormorant+Garamond:wght@400;600;700&family=DM+Sans:wght@400;500;700&family=DM+Serif+Display&family=Fjalla+One&family=Inter:wght@400;700;900&family=Lato:wght@400;700&family=Lora:ital,wght@0,400;0,700;1,400&family=Montserrat:wght@400;600;700;800&family=Open+Sans:wght@400;600&family=Oswald:wght@400;600;700&family=Playfair+Display:wght@400;700;900&family=Poppins:wght@400;600;700&family=Raleway:wght@700;800&family=Roboto:wght@400;500&family=Space+Grotesk:wght@400;500;700&family=Syne:wght@400;600;700;800&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.classList.add('dark');})();`,
          }}
        />
      </head>
      <body
        className={`${interTight.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} antialiased`}
        style={{
          fontFamily:
            "var(--font-inter-tight), 'Inter Tight', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
