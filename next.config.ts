import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O pacote oficial Heroicons Animated é um componente client-side Motion.
  // Mantê-lo no bundle do fork Next evita externalização inconsistente do
  // módulo `motion/react` nos chunks SSR/client.
  transpilePackages: ['@heroicons-animated/react'],
  turbopack: {
    root: process.cwd(),
  },
  // Só vale em `next dev`. Sem isto, o dev server BLOQUEIA as requisições a
  // /_next/* vindas de outra origem (o túnel usado para testar o checkout do
  // Asaas), o cliente do Next nunca termina de hidratar e NENHUM onClick da
  // página funciona — sem erro nenhum no console. Produção não tem esse guarda.
  allowedDevOrigins: ['*.trycloudflare.com'],
  experimental: {
    // Libera unauthorized() e forbidden() de next/navigation. É o que permite
    // que uma PÁGINA responda 401/403 de verdade em vez de redirecionar para o
    // login (que diria "a rota existe, só entre") ou devolver 200 com uma tela
    // de erro. Usado só pelo /admin — ver lib/admin-page-guard.ts.
    authInterrupts: true,
  },
  // CSP fica para depois (Report-Only primeiro): o site carrega Google Fonts,
  // Typekit, Supabase e imagens externas, e uma CSP mal calibrada quebra
  // produção. HSTS já é aplicado fora do Next (proxy/plataforma).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
