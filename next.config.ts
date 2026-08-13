import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  // Só vale em `next dev`. Sem isto, o dev server BLOQUEIA as requisições a
  // /_next/* vindas de outra origem (o túnel usado para testar o checkout do
  // Asaas), o cliente do Next nunca termina de hidratar e NENHUM onClick da
  // página funciona — sem erro nenhum no console. Produção não tem esse guarda.
  allowedDevOrigins: ['*.trycloudflare.com'],
};

export default nextConfig;
