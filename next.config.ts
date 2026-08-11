import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        // O core do ffmpeg.wasm (public/ffmpeg/<versao>/) tem ~31MB. O default
        // do Next para arquivos de /public é `Cache-Control: public, max-age=0`,
        // que revalidaria esses 31MB a cada sessão de export. Marcamos immutable
        // com TTL de 1 ano: do 2º export em diante o browser serve do cache.
        //
        // `immutable` só é seguro porque a URL é VERSIONADA
        // (/ffmpeg/0.12.10/...): a promessa "esta URL nunca muda" vale, e subir
        // a versão do core gera URL nova em vez de deixar cache velho grudado
        // por um ano. Se algum dia o caminho voltar a ser fixo, este header
        // PRECISA sair junto — ver FFMPEG_CORE_BASE em lib/reels-export.ts.
        source: "/ffmpeg/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
