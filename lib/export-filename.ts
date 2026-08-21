/**
 * NOME DO ARQUIVO EXPORTADO — fonte única.
 *
 * Regra de produto (Rafael, 20/08/2026): TODA exportação de imagem ou ZIP sai
 * com o nome da marca na frente, sem exceção — o arquivo baixado E cada entrada
 * dentro do ZIP.
 *
 *   carrossel          → "Creatools - <TÍTULO DO CARROSSEL>"
 *   grupo de News      → "Creatools News - <DATA DO GRUPO>"
 *   notícia avulsa     → "Creatools News - <TÍTULO CURTO>"
 *
 * Este módulo existe para que nenhum ponto de exportação monte string por conta
 * própria: eram 6 lugares com 3 convenções diferentes ("slide-1.png",
 * "carrossel-postflow.zip", "arke-news-01.png"), e um nome novo em cada tela é
 * como a padronização se perde na próxima feature. Funções puras, sem DOM —
 * dá para afirmar cada regra em teste de node, que é o que o browser não
 * responde.
 */

/** Prefixo do carrossel. Uma constante, não uma string solta em 3 arquivos. */
const PREFIXO_CARROSSEL = 'Creatools';

/** Prefixo das notícias — vale para o lote e para o card avulso. */
const PREFIXO_NEWS = 'Creatools News';

/** Separador entre prefixo, título e número. Espaçado de propósito: o nome é
 *  lido por gente na pasta de Downloads, não por parser. */
const SEP = ' - ';

/**
 * Título que entra quando o que veio é vazio, só espaço ou só caractere
 * inválido. Fallback EXPLÍCITO: um nome ruim ainda é um arquivo que o usuário
 * acha; um nome vazio vira "​.png" (ou "download.png" que o browser inventa) e
 * o arquivo se perde na pasta.
 */
export const FALLBACK_TITULO_CARROSSEL = 'Carrossel';

/** O mesmo, para a notícia avulsa sem `titulo_card`. */
export const FALLBACK_TITULO_NOTICIA = 'Notícia';

/**
 * Teto do nome BASE (sem a extensão).
 *
 * Não é estética: o limite clássico de nome de arquivo é 255 bytes, e um
 * título em português cheio de acento gasta 2 bytes por caractere em UTF-8.
 * 120 caracteres cabem com folga em qualquer sistema e ainda deixam o nome
 * legível de uma olhada.
 */
export const MAX_NOME_BASE = 120;

/**
 * Caracteres que nenhum sistema aceita em nome de arquivo.
 *
 * `/` quebra no macOS e no Linux; o resto (`\ : * ? " < > |`) é a lista do
 * Windows. Vão todos, mais os caracteres de controle (\x00-\x1F e \x7F), que
 * não aparecem na tela mas viajam colados em texto copiado da web.
 *
 * Viram ESPAÇO, não somem: "IA/Robótica" precisa virar "IA Robótica", não
 * "IARobótica" — apagar cola palavras que não eram uma só.
 */
const INVALIDOS = /[/\\:*?"<>|\u0000-\u001F\u007F]/g;

/**
 * Limpa um pedaço de texto para virar nome de arquivo.
 *
 * ACENTO E CEDILHA FICAM. O Rafael escreve em português e o título é dele:
 * "Não" virando "Nao" é perda de conteúdo, não sanitização. UTF-8 é aceito em
 * nome de arquivo em todo sistema que este app roda — o que não é aceito é a
 * lista de `INVALIDOS` acima, e é só ela que sai.
 *
 * Ordem importa: primeiro tira o inválido (que vira espaço), só depois colapsa
 * espaço — senão "A/ B" sobraria com espaço duplo.
 *
 * @param bruto texto do usuário (título do carrossel, do card…)
 * @param fallback nome usado quando não sobra nada de útil
 */
export function sanitizarParteDeNome(bruto: string | null | undefined, fallback: string): string {
  const limpo = String(bruto ?? '')
    .replace(INVALIDOS, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Ponto e hífen no fim são aparados junto: o Windows recusa nome terminado em
  // ponto ou espaço (some sem avisar), e hífen solto no fim só suja o nome.
  const aparado = aparaPontas(limpo);
  return aparado || fallback;
}

/** Tira espaço, ponto e hífen das pontas. Usado depois de cada corte. */
function aparaPontas(texto: string): string {
  return texto.replace(/^[\s.\-]+/, '').replace(/[\s.\-]+$/, '');
}

/**
 * Monta o nome base juntando prefixo + título + sufixo, respeitando o teto.
 *
 * Quem encolhe é o TÍTULO, nunca o prefixo nem o número: um nome cortado em
 * "Creatools - Um título muito lo" ainda diz de onde veio e qual slide é;
 * cortar o "- 03" do fim faria dois slides baixarem com o mesmo nome, que é
 * exatamente o problema que a numeração resolve.
 */
function montarBase(prefixo: string, titulo: string, sufixo = ''): string {
  const fixo = prefixo.length + SEP.length + sufixo.length;
  const orcamento = Math.max(1, MAX_NOME_BASE - fixo);
  const cortado = titulo.length > orcamento ? aparaPontas(titulo.slice(0, orcamento)) : titulo;
  return `${prefixo}${SEP}${cortado}${sufixo}`;
}

/**
 * Número do slide/card no nome: 2 dígitos, base 1 ("01", "02"… "10").
 *
 * Dois dígitos porque um dígito faz o sistema operacional ordenar
 * "1, 10, 2, 3" na pasta — a ordem visual deixa de ser a ordem do carrossel.
 * Acima de 99 o número simplesmente cresce; melhor um "100" do que um nome
 * truncado e ambíguo.
 */
function sufixoNumerado(numero: number): string {
  return `${SEP}${String(numero).padStart(2, '0')}`;
}

/**
 * Imagem de um slide do carrossel: "Creatools - <TÍTULO> - 03.png".
 *
 * A MESMA função serve ao slide baixado avulso e à entrada dentro do ZIP, de
 * propósito: o usuário que baixa o slide 3 sozinho e depois abre o ZIP tem que
 * reconhecer o mesmo arquivo. O número é obrigatório nos dois casos — sem ele o
 * slide 1 e o slide 5 baixam com nome idêntico e um sobrescreve o outro na
 * pasta de Downloads, em silêncio.
 *
 * @param titulo `carouselTitle` do editor (o default "Novo Carrossel" é título
 *   válido, não vazio — quem nunca renomeou o deck ainda recebe um nome bom)
 * @param numeroDoSlide número do slide na base 1
 */
export function nomeDoSlideDoCarrossel(titulo: string | null | undefined, numeroDoSlide: number): string {
  const t = sanitizarParteDeNome(titulo, FALLBACK_TITULO_CARROSSEL);
  return `${montarBase(PREFIXO_CARROSSEL, t, sufixoNumerado(numeroDoSlide))}.png`;
}

/**
 * ZIP do carrossel inteiro: "Creatools - <TÍTULO>.zip".
 *
 * SEM número: o ZIP é o carrossel todo, não um slide. A numeração vive dentro
 * dele, nas entradas.
 */
export function nomeDoZipDoCarrossel(titulo: string | null | undefined): string {
  const t = sanitizarParteDeNome(titulo, FALLBACK_TITULO_CARROSSEL);
  return `${montarBase(PREFIXO_CARROSSEL, t)}.zip`;
}

/**
 * Data do lote de News no nome do arquivo: DD-MM-AAAA.
 *
 * 🔴 TIMEZONE LOCAL, nunca `toISOString()`. O `created_at` do banco vem em UTC:
 * um lote salvo às 22h em São Paulo (UTC-3) é 01h do dia SEGUINTE em UTC, e
 * `toISOString().slice(0,10)` entregaria ao usuário um arquivo com a data de
 * amanhã. O usuário só conhece o relógio dele — e é essa mesma data que a lista
 * de lotes já mostra na tela (`toLocaleDateString('pt-BR')`), então o nome do
 * arquivo bate com o card de onde ele saiu.
 *
 * Hífen no lugar da barra porque `/` é separador de diretório: "20/08/2026"
 * seria sanitizado para "20 08 2026" e perderia a forma de data.
 *
 * @param iso `created_at` do lote. Ausente ou inválido cai em HOJE — e isso é
 *   correto, não chute: o lote sem data gravada é o que está sendo criado
 *   agora, e a data dele é a de hoje.
 */
export function dataDoLoteParaNome(iso: string | Date | null | undefined): string {
  const d = iso instanceof Date ? iso : iso ? new Date(iso) : new Date();
  const valida = Number.isNaN(d.getTime()) ? new Date() : d;

  const dia = String(valida.getDate()).padStart(2, '0');
  const mes = String(valida.getMonth() + 1).padStart(2, '0');
  return `${dia}-${mes}-${valida.getFullYear()}`;
}

/**
 * ZIP do lote de News: "Creatools News - 20-08-2026.zip".
 *
 * O lote não tem título — o que o identifica para o usuário é a data, que é
 * como a tela de lotes já os lista.
 */
export function nomeDoZipDeNoticias(dataDoLote: string | Date | null | undefined): string {
  const data = dataDoLoteParaNome(dataDoLote);
  return `${montarBase(PREFIXO_NEWS, data)}.zip`;
}

/**
 * Card dentro do ZIP do lote: "Creatools News - 20-08-2026 - 01.png".
 *
 * Numerado pelo mesmo motivo do carrossel: 10 cards do mesmo lote não podem
 * disputar um nome só. O número é o `numero` do card, que é a ordem que o
 * usuário vê na tira de miniaturas.
 */
export function nomeDoCardDoLote(
  dataDoLote: string | Date | null | undefined,
  numeroDoCard: number,
): string {
  const data = dataDoLoteParaNome(dataDoLote);
  return `${montarBase(PREFIXO_NEWS, data, sufixoNumerado(numeroDoCard))}.png`;
}

/**
 * Notícia baixada sozinha: "Creatools News - <TÍTULO CURTO>.png".
 *
 * Aqui o nome vem do TÍTULO, não da data: quem baixa um card só está atrás
 * daquela notícia específica, e "Creatools News - 20-08-2026 - 04.png" não diz
 * qual é. Sem número porque não há irmão para colidir — e título repetido é
 * problema do browser, que já resolve com "(1)".
 *
 * @param tituloCard `titulo_card` do card. Vazio cai no fallback.
 */
export function nomeDaNoticiaAvulsa(tituloCard: string | null | undefined): string {
  const t = sanitizarParteDeNome(tituloCard, FALLBACK_TITULO_NOTICIA);
  return `${montarBase(PREFIXO_NEWS, t)}.png`;
}
