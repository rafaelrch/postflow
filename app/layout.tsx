import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

// Fontes self-hosted (woff2 em app/fonts/). Evita o download de runtime do
// next/font/google, que trava a compilação quando a rede ao Google Fonts falha.
const interTight = localFont({
  variable: '--font-inter-tight',
  display: 'swap',
  src: [
    { path: './fonts/InterTight-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/InterTight-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/InterTight-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/InterTight-700.woff2', weight: '700', style: 'normal' },
  ],
});

const interDisplay = localFont({
  variable: '--font-inter-display',
  display: 'swap',
  src: [
    { path: './fonts/InterDisplay-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/InterDisplay-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/InterDisplay-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/InterDisplay-700.woff2', weight: '700', style: 'normal' },
    { path: './fonts/InterDisplay-800.woff2', weight: '800', style: 'normal' },
  ],
});

const instrumentSerif = localFont({
  variable: '--font-instrument-serif',
  display: 'swap',
  src: [
    { path: './fonts/InstrumentSerif-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/InstrumentSerif-400-italic.woff2', weight: '400', style: 'italic' },
  ],
});

const jetbrainsMono = localFont({
  variable: '--font-jetbrains-mono',
  display: 'swap',
  src: [
    { path: './fonts/JetBrainsMono-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/JetBrainsMono-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/JetBrainsMono-600.woff2', weight: '600', style: 'normal' },
  ],
});

export const metadata: Metadata = {
  title: 'Creatools — Ferramentas criativas para creators',
  description:
    'Creatools: carrosséis, notícias e agenda de postagem em um só lugar. Criação assistida por IA com design brutalist e identidade forte.',
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
        className={`${interTight.variable} ${interDisplay.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} antialiased`}
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
