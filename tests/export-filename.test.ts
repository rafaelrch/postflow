import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  FALLBACK_TITULO_CARROSSEL,
  FALLBACK_TITULO_NOTICIA,
  MAX_NOME_BASE,
  dataDoLoteParaNome,
  nomeDaNoticiaAvulsa,
  nomeDoCardDoLote,
  nomeDoSlideDoCarrossel,
  nomeDoZipDeNoticias,
  nomeDoZipDoCarrossel,
  sanitizarParteDeNome,
} from '@/lib/export-filename';

/**
 * NOME DO ARQUIVO EXPORTADO — regra de produto do Rafael (20/08/2026).
 *
 * Toda exportação de imagem ou ZIP sai com a marca na frente: o arquivo
 * baixado E cada entrada dentro do ZIP. Eram 6 pontos com 3 convenções
 * diferentes; agora é um módulo só, e é aqui que cada regra dele fica travada.
 *
 * Os dois pontos que só um teste enxerga:
 * - a NUMERAÇÃO não é enfeite. Sem ela o slide 1 e o slide 5 baixam com o mesmo
 *   nome e um sobrescreve o outro na pasta de Downloads, em silêncio.
 * - a DATA é do relógio LOCAL. `toISOString()` num lote salvo às 22h em
 *   São Paulo entregaria o arquivo com a data de amanhã.
 */

afterEach(() => {
  vi.useRealTimers();
});

describe('sanitizarParteDeNome — o que sai e o que FICA', () => {
  it.each([
    ['barra', 'IA/Robótica', 'IA Robótica'],
    ['contrabarra', 'IA\\Robótica', 'IA Robótica'],
    ['dois-pontos', 'Notícia: o fim', 'Notícia o fim'],
    ['asterisco', 'Lucro *recorde*', 'Lucro recorde'],
    ['interrogação', 'E agora?', 'E agora'],
    ['aspas', 'O "melhor" ano', 'O melhor ano'],
    ['menor', 'Custo <1%', 'Custo 1%'],
    ['maior', 'Alta >50%', 'Alta 50%'],
    ['pipe', 'IA | Mercado', 'IA Mercado'],
  ])('remove o caractere inválido: %s', (_nome, entrada, esperado) => {
    expect(sanitizarParteDeNome(entrada, 'X')).toBe(esperado);
  });

  it('remove caractere de CONTROLE, que viaja invisível em texto colado da web', () => {
    expect(sanitizarParteDeNome('Alta de\u0007juros\u001Fhoje', 'X')).toBe('Alta de juros hoje');
  });

  it('colapsa espaço duplo e apara as pontas', () => {
    expect(sanitizarParteDeNome('  Meu    carrossel  ', 'X')).toBe('Meu carrossel');
  });

  it('inválido colado vira UM espaço, não um buraco de espaços', () => {
    // "A//B" apagando viraria "AB" — palavras que não eram uma só, coladas.
    expect(sanitizarParteDeNome('A//B', 'X')).toBe('A B');
  });

  it.each([
    ['vazio', ''],
    ['só espaço', '   '],
    ['undefined', undefined],
    ['null', null],
    ['só caractere inválido', '///'],
  ])('cai no fallback explícito quando não sobra nada: %s', (_nome, entrada) => {
    // Nome vazio não vira arquivo: vira "download.png" inventado pelo browser,
    // e o usuário não acha o que baixou.
    expect(sanitizarParteDeNome(entrada, 'Carrossel')).toBe('Carrossel');
  });

  it('PRESERVA acento e cedilha — o título é do usuário, e ele escreve em português', () => {
    expect(sanitizarParteDeNome('Ação, Não e Coração', 'X')).toBe('Ação, Não e Coração');
  });

  it('não termina em ponto nem em espaço — o Windows recusa e o arquivo some', () => {
    expect(sanitizarParteDeNome('Fim da linha... ', 'X')).toBe('Fim da linha');
  });

  it('não termina em hífen solto', () => {
    expect(sanitizarParteDeNome('Título -', 'X')).toBe('Título');
  });

  it('hífen NO MEIO fica: é texto do usuário, não sujeira', () => {
    expect(sanitizarParteDeNome('Antes - Depois', 'X')).toBe('Antes - Depois');
  });
});

describe('carrossel', () => {
  it('slide avulso: "Creatools - <TÍTULO> - <NN>.png"', () => {
    expect(nomeDoSlideDoCarrossel('Meu Carrossel', 3)).toBe('Creatools - Meu Carrossel - 03.png');
  });

  it('o número tem 2 dígitos e base 1', () => {
    // Um dígito faz a pasta ordenar "1, 10, 2, 3" e a ordem visual deixa de ser
    // a ordem do carrossel.
    expect(nomeDoSlideDoCarrossel('X', 1)).toBe('Creatools - X - 01.png');
    expect(nomeDoSlideDoCarrossel('X', 9)).toBe('Creatools - X - 09.png');
    expect(nomeDoSlideDoCarrossel('X', 10)).toBe('Creatools - X - 10.png');
  });

  it('a entrada do ZIP usa o MESMO nome do slide avulso', () => {
    // De propósito: quem baixou o slide 3 sozinho reconhece o mesmo arquivo
    // dentro do ZIP.
    expect(nomeDoSlideDoCarrossel('Meu Carrossel', 3)).toBe('Creatools - Meu Carrossel - 03.png');
  });

  it('ZIP: "Creatools - <TÍTULO>.zip", SEM número', () => {
    expect(nomeDoZipDoCarrossel('Meu Carrossel')).toBe('Creatools - Meu Carrossel.zip');
  });

  it('"Novo Carrossel" (o default do editor) é título VÁLIDO, não vazio', () => {
    expect(nomeDoZipDoCarrossel('Novo Carrossel')).toBe('Creatools - Novo Carrossel.zip');
  });

  it('título vazio cai no fallback, nunca num arquivo sem nome', () => {
    expect(nomeDoZipDoCarrossel('   ')).toBe(`Creatools - ${FALLBACK_TITULO_CARROSSEL}.zip`);
    expect(nomeDoSlideDoCarrossel('', 2)).toBe(`Creatools - ${FALLBACK_TITULO_CARROSSEL} - 02.png`);
  });

  it('título com caractere inválido sai limpo, com acento intacto', () => {
    expect(nomeDoSlideDoCarrossel('IA/Robótica: 2026?', 1)).toBe('Creatools - IA Robótica 2026 - 01.png');
  });
});

describe('tamanho máximo', () => {
  const longo = 'a'.repeat(400);

  it('o nome base cabe no teto, e a extensão fica de fora da conta', () => {
    const nome = nomeDoZipDoCarrossel(longo);
    expect(nome.endsWith('.zip')).toBe(true);
    expect(nome.slice(0, -'.zip'.length).length).toBeLessThanOrEqual(MAX_NOME_BASE);
  });

  it('quem encolhe é o TÍTULO: prefixo e número sobrevivem ao corte', () => {
    // Cortar o "- 03" faria dois slides baixarem com o mesmo nome — que é
    // exatamente o problema que a numeração resolve.
    const nome = nomeDoSlideDoCarrossel(longo, 3);
    expect(nome.startsWith('Creatools - ')).toBe(true);
    expect(nome.endsWith(' - 03.png')).toBe(true);
    expect(nome.slice(0, -'.png'.length).length).toBeLessThanOrEqual(MAX_NOME_BASE);
  });

  it('o corte não deixa espaço nem hífen solto grudado no fim', () => {
    // Um título que termina bem no limite com espaço/hífen viraria
    // "Creatools - ... - .png" se o corte fosse cego.
    const base = `${'b'.repeat(106)} - ${'c'.repeat(50)}`;
    const nome = nomeDoZipDoCarrossel(base);
    const semExtensao = nome.slice(0, -'.zip'.length);
    expect(semExtensao).not.toMatch(/[\s.-]$/);
  });

  it('título curto não é tocado', () => {
    expect(nomeDoZipDoCarrossel('Curto')).toBe('Creatools - Curto.zip');
  });
});

describe('data do lote de News — relógio LOCAL, formato DD-MM-AAAA', () => {
  it('formata com dia e mês de 2 dígitos', () => {
    expect(dataDoLoteParaNome(new Date(2026, 7, 20, 10, 0, 0))).toBe('20-08-2026');
    expect(dataDoLoteParaNome(new Date(2026, 0, 5, 10, 0, 0))).toBe('05-01-2026');
  });

  it('🔴 lote salvo às 22h NÃO vira o dia seguinte — o que toISOString() faria', () => {
    // 20/08/2026 22:30 no relógio local. Em UTC-3 isso é 01:30 de 21/08 em UTC,
    // e `toISOString().slice(0,10)` entregaria "2026-08-21" ao usuário.
    const local = new Date(2026, 7, 20, 22, 30, 0);
    expect(dataDoLoteParaNome(local)).toBe('20-08-2026');
    expect(dataDoLoteParaNome(local.toISOString())).toBe('20-08-2026');
  });

  it('sem data grava HOJE: o lote sem created_at é o que está sendo criado agora', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 20, 9, 0, 0));
    expect(dataDoLoteParaNome(null)).toBe('20-08-2026');
    expect(dataDoLoteParaNome(undefined)).toBe('20-08-2026');
    expect(dataDoLoteParaNome('')).toBe('20-08-2026');
  });

  it('data inválida também cai em hoje, em vez de "NaN-NaN-NaN"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 20, 9, 0, 0));
    expect(dataDoLoteParaNome('isto não é data')).toBe('20-08-2026');
  });

  it('a data usa hífen, não barra — barra é separador de diretório', () => {
    expect(dataDoLoteParaNome(new Date(2026, 7, 20))).not.toContain('/');
  });
});

describe('News', () => {
  const lote = new Date(2026, 7, 20, 22, 30, 0);

  it('ZIP do lote: "Creatools News - <DATA>.zip"', () => {
    expect(nomeDoZipDeNoticias(lote)).toBe('Creatools News - 20-08-2026.zip');
  });

  it('entrada do ZIP: "Creatools News - <DATA> - <NN>.png"', () => {
    expect(nomeDoCardDoLote(lote, 1)).toBe('Creatools News - 20-08-2026 - 01.png');
    expect(nomeDoCardDoLote(lote, 10)).toBe('Creatools News - 20-08-2026 - 10.png');
  });

  it('notícia avulsa: "Creatools News - <TÍTULO CURTO>.png", sem número', () => {
    // Quem baixa um card só está atrás DAQUELA notícia — a data não diz qual é.
    expect(nomeDaNoticiaAvulsa('OpenAI capta US$ 122 bi')).toBe(
      'Creatools News - OpenAI capta US$ 122 bi.png'
    );
  });

  it('notícia sem título cai no fallback', () => {
    expect(nomeDaNoticiaAvulsa('  ')).toBe(`Creatools News - ${FALLBACK_TITULO_NOTICIA}.png`);
  });

  it('título de notícia com dois-pontos e acento sai legível', () => {
    expect(nomeDaNoticiaAvulsa('Ação sobe: recorde histórico')).toBe(
      'Creatools News - Ação sobe recorde histórico.png'
    );
  });
});

describe('extensão', () => {
  it('imagem sempre .png, pacote sempre .zip', () => {
    expect(nomeDoSlideDoCarrossel('T', 1).endsWith('.png')).toBe(true);
    expect(nomeDoCardDoLote(new Date(2026, 7, 20), 1).endsWith('.png')).toBe(true);
    expect(nomeDaNoticiaAvulsa('T').endsWith('.png')).toBe(true);
    expect(nomeDoZipDoCarrossel('T').endsWith('.zip')).toBe(true);
    expect(nomeDoZipDeNoticias(new Date(2026, 7, 20)).endsWith('.zip')).toBe(true);
  });

  it('nenhum nome gerado contém caractere inválido de sistema de arquivo', () => {
    const nomes = [
      nomeDoSlideDoCarrossel('IA/Robótica: "2026"', 1),
      nomeDoZipDoCarrossel('IA/Robótica: "2026"'),
      nomeDaNoticiaAvulsa('A|B<C>D?E*F'),
      nomeDoZipDeNoticias(new Date(2026, 7, 20)),
      nomeDoCardDoLote(new Date(2026, 7, 20), 4),
    ];
    for (const n of nomes) expect(n).not.toMatch(/[/\\:*?"<>|]/);
  });
});
