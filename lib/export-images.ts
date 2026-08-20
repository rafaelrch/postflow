import { GlobalSettings, Slide, SlideStyle } from '@/types';

/**
 * Blindagem da exportação contra a falha silenciosa do html-to-image.
 *
 * O problema (provado na fonte da lib, `lib/dataurl.js`): quando o download de
 * uma imagem falha, `resourceToDataURL` grava STRING VAZIA no cache de módulo
 * dela e devolve essa string em toda chamada seguinte, sem tocar na rede. A
 * camada vira `background-image: url("")`, o PNG sai sem imagem, e o
 * `console.warn` só acontece na tentativa que falhou — da segunda em diante o
 * console fica limpo. Resultado: a partir de uma falha, toda exportação daquela
 * aba sai muda e quebrada até um reload, e um `fetch` manual da mesma URL
 * responde 200 alegremente, porque a rede nunca mais é consultada.
 *
 * A saída: baixar as imagens NÓS MESMOS e entregar o slide para a lib já com
 * `data:` no lugar das URLs. A lib pula o que já é data URL (`isDataUrl` em
 * `embed-images.js`), então ela nunca entra naquele caminho — e, quando um
 * download falha, quem decide o que fazer somos nós: erro visível, sem arquivo.
 */

/** Uma URL que precisa ser baixada para entrar no PNG. */
function isRemoteUrl(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && !value.startsWith('data:')
    && /^(https?:)?\/\//.test(value);
}

/**
 * Todas as imagens que os slides EXIBEM, lidas do estado — nunca varrendo o
 * DOM. A regra tem de acompanhar o que cada componente de slide realmente
 * renderiza; um espelho aproximado aqui significaria baixar imagem que ninguém
 * vê (e barrar a exportação por causa dela) ou deixar passar imagem que aparece.
 *
 * O que NÃO entra, de propósito:
 * - o fundo dos slides internos do Editorial: lá a imagem vai no card, e o
 *   `backgroundImageUrl` que sobrou em deck antigo é dado morto (o painel tem
 *   um aviso próprio para limpar). Baixá-lo poderia derrubar a exportação por
 *   uma imagem que não é desenhada.
 * - os campos genéricos no Template 2, que o `Template02Slide` nunca lê.
 * - `/selo_insta.png`, o selo de verificado do Perfil: é asset local do próprio
 *   deploy, mesma origem, e entra por `<img>` — não passa pelo caminho de rede
 *   que quebra aqui.
 */
export function slideImageUrls(
  slides: Slide[],
  style: SlideStyle,
  globalSettings: GlobalSettings,
  /**
   * Só as imagens deste slide. O deck INTEIRO continua sendo percorrido: o
   * layout padrão do Editorial depende da posição (`i === 0` é capa), e passar
   * um array de um elemento faria todo slide interno virar capa.
   *
   * Existe porque exportar o slide 1 não pode falhar por causa de uma imagem
   * quebrada no slide 5.
   */
  somenteIndice?: number
): string[] {
  const urls: string[] = [];
  const add = (v: unknown) => {
    if (isRemoteUrl(v)) urls.push(v);
  };

  if (style === 'profile') add(globalSettings.profileBadge?.photo);

  for (const [i, slide] of slides.entries()) {
    if (somenteIndice !== undefined && i !== somenteIndice) continue;

    if (style === 'template01' || style === 'template02') {
      // Todo valor de slot que é URL. Ler os slots em vez de reconstruir a
      // varredura do spec evita ficar fora de sincronia com o template quando
      // ele ganhar um slot de imagem novo — texto não casa com `isRemoteUrl`.
      for (const valor of Object.values(slide.templateSlots ?? {})) add(valor);
      // O T1 ainda cai nos campos genéricos quando o slot está vazio (deck
      // salvo antes da regra do slot). O T2 nunca os lê.
      if (style === 'template01') {
        add(slide.backgroundImageUrl);
        add(slide.gridImageUrl);
        add(slide.contentImageUrl);
      }
      continue;
    }

    if (style === 'editorial') {
      const layout = slide.contentLayout ?? (i === 0 ? 'cover' : 'text-image-text');
      if (layout === 'cover') {
        add(slide.backgroundImageUrl || slide.gridImageUrl);
      }
      add(slide.contentImageUrl);
      continue;
    }

    if (style === 'profile') {
      add(slide.gridImageUrl || slide.backgroundImageUrl);
      continue;
    }

    // minimalist
    add(slide.backgroundImageUrl || slide.gridImageUrl);
    add(slide.contentImageUrl);
  }

  return [...new Set(urls)];
}

/** Erro de blindagem: carrega a URL para o toast poder nomear o que faltou. */
export class ExportImageError extends Error {
  url: string;
  constructor(url: string, causa?: unknown) {
    super(
      `Não foi possível carregar uma imagem do carrossel (${url}).`
      + (causa instanceof Error ? ` ${causa.message}` : '')
    );
    this.name = 'ExportImageError';
    this.url = url;
  }
}

async function toDataUrl(url: string): Promise<string> {
  // Sem cache-bust: aqui URL de imagem nunca muda de conteúdo (toda geração e
  // todo upload escrevem num caminho novo, com `upsert: false`), então o que a
  // query extra faria é só forçar rebaixar tudo, ignorando o cache do browser.
  const res = await fetch(url);
  if (!res.ok) throw new ExportImageError(url, new Error(`HTTP ${res.status}`));
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new ExportImageError(url, reader.error));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

/**
 * Baixa cada URL UMA vez e devolve o mapa url → data URL.
 *
 * Uma vez por exportação, não por slide: no ZIP a mesma imagem pode repetir em
 * vários slides, e o mapa é compartilhado por todos eles.
 *
 * Estoura no primeiro fracasso, de propósito — quem chama tem de decidir entre
 * avisar o usuário e entregar um arquivo capenga, e a decisão do Rafael é
 * avisar.
 */
export async function preloadExportImages(urls: string[]): Promise<Map<string, string>> {
  const pares = await Promise.all(
    urls.map(async (url) => {
      try {
        return [url, await toDataUrl(url)] as const;
      } catch (err) {
        throw err instanceof ExportImageError ? err : new ExportImageError(url, err);
      }
    })
  );
  return new Map(pares);
}

const CSS_URL = /url\((['"]?)([^'")]+)\1\)/g;

/**
 * Troca as URLs por data URLs na árvore oculta de exportação e devolve a função
 * que desfaz.
 *
 * Mexer no DOM aqui é inevitável — é o único jeito de a lib receber o slide já
 * embutido sem arrastar o mapa por todos os componentes de slide. Mas é a nossa
 * árvore oculta, e o restore roda em `finally`: a tela do usuário não vê nada
 * disso.
 */
export function applyEmbeddedImages(root: HTMLElement, mapa: Map<string, string>): () => void {
  const desfazer: Array<() => void> = [];
  const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];

  for (const el of nodes) {
    const bg = el.style?.backgroundImage;
    if (bg && bg.includes('url(')) {
      const novo = bg.replace(CSS_URL, (raw, aspas, url) => {
        const data = mapa.get(url);
        return data ? `url(${aspas}${data}${aspas})` : raw;
      });
      if (novo !== bg) {
        const anterior = bg;
        el.style.backgroundImage = novo;
        desfazer.push(() => { el.style.backgroundImage = anterior; });
      }
    }

    // O Perfil desenha a mídia do post num `<img>`, não num background.
    if (el instanceof HTMLImageElement) {
      const data = mapa.get(el.src);
      if (data) {
        const anterior = el.src;
        el.src = data;
        desfazer.push(() => { el.src = anterior; });
      }
    }
  }

  return () => desfazer.forEach((f) => f());
}
