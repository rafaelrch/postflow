import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ATELIER_ENABLED } from '@/lib/feature-flags';

/**
 * A VITRINE DA LANDING SÓ PODE MOSTRAR TEMPLATE QUE O WIZARD OFERECE.
 *
 * O invariante já estava escrito em comentário na própria landing — *"todo
 * rótulo aqui tem que ser um template que o wizard oferece"* — e comentário não
 * segura nada: o Atelier foi desligado na T2 e a landing continuou vendendo ele
 * em cinco pontos. Prometer o que o produto não entrega é o pior tipo de bug de
 * copy, porque ninguém percebe olhando o código de um lado só.
 *
 * Aqui o invariante vira teste, ligando os DOIS lados: os nomes que aparecem na
 * landing têm de sair da lista `TEMPLATES` de `CreateWizard.tsx`, que é a oferta
 * real. Desligar um template sem mexer na landing passa a derrubar a suíte.
 *
 * 🔴 ATUALIZADO NA INTEGRAÇÃO (integra/ciclo-2, 02/09/2026). A versão anterior
 * deste comentário dizia que amarrar à chave `ATELIER_ENABLED` era impossível,
 * porque ela vivia noutra branch. Agora as duas convivem, então a amarração é a
 * de verdade: a oferta é o catálogo `ALL_TEMPLATES` com o mesmo filtro que o
 * wizard aplica.
 *
 * E foi a integração que provou o dente deste teste sem ninguém pedir: a branch
 * do Atelier RENOMEOU `TEMPLATES` para `ALL_TEMPLATES` (deixando `TEMPLATES`
 * como a lista derivada), o `indexOf('const TEMPLATES')` passou a casar com a
 * linha do filtro, e a leitura caiu num bloco vizinho devolvendo rótulos de
 * FORMATO. O teste quebrou na primeira vez que as duas mudanças existiram no
 * mesmo lugar — que é exatamente quando ele tinha de falar.
 *
 * LIÇÃO, que vale para todo teste que lê FONTE em vez de importar: ele depende
 * da FORMA do arquivo, e a forma muda sem aviso. Por isso a leitura abaixo
 * ancora no catálogo pelo nome exato e falha alto se ele sumir, em vez de casar
 * com o primeiro `const TEMPLATES` que aparecer.
 */

const raiz = (caminho: string) => readFileSync(join(process.cwd(), caminho), 'utf8');

const landing = raiz('app/(marketing)/page.tsx');
const wizard = raiz('components/editor/CreateWizard.tsx');

/** O fonte sem comentários — é a COPY que o usuário lê, não a história do arquivo. */
function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Os rótulos da lista `TEMPLATES` do wizard — a oferta real.
 *
 * Lido do FONTE porque a lista não é exportada. Exportá-la só para o teste
 * mudaria o componente por causa da suíte; ler o texto não mexe em produção.
 */
function rotulosDoWizard(): string[] {
  // O CATÁLOGO completo, pelo nome exato. `ALL_TEMPLATES` é o literal com todos
  // os templates; `TEMPLATES` passou a ser a lista DERIVADA (o filtro da flag),
  // e casar com ela devolveria zero rótulo — ou, pior, os do bloco seguinte.
  const inicio = wizard.indexOf('const ALL_TEMPLATES');
  expect(inicio, 'o catálogo ALL_TEMPLATES sumiu do wizard').toBeGreaterThan(-1);
  const fim = wizard.indexOf('\n];', inicio);
  const bloco = wizard.slice(inicio, fim);
  const catalogo = Array.from(bloco.matchAll(/value: '([^']+)',\s*\n\s*label: '([^']+)'/g))
    .map((m) => ({ value: m[1], label: m[2] }));
  expect(catalogo.length, 'não consegui ler o catálogo de templates').toBeGreaterThan(0);

  // O MESMO filtro que o wizard aplica. A oferta é o catálogo menos o que a
  // flag desliga — é isso que a landing tem direito de vender.
  return catalogo
    .filter((tpl) => tpl.value !== 'editorial' || ATELIER_ENABLED)
    .map((tpl) => tpl.label);
}

/** Os nomes de template citados na vitrine da landing. */
function nomesNaLanding(): string[] {
  const copy = semComentarios(landing);
  const nomes = new Set<string>();

  // 1. o array do MockTemplates
  const mock = copy.match(/const templates = \[([^\]]+)\]/);
  expect(mock, 'o array do MockTemplates sumiu').toBeTruthy();
  for (const m of mock![1].matchAll(/'([^']+)'/g)) nomes.add(m[1]);

  // 2. a frase do STEPS e os bullets das FEATURES, que listam os nomes em prosa
  for (const linha of copy.split('\n')) {
    if (!/escolha o template:|templates prontos:|^\s+'Profile, /.test(linha)) continue;
    for (const nome of rotulosDoWizard()) {
      if (new RegExp(`\\b${nome}\\b`).test(linha)) nomes.add(nome);
    }
  }
  return Array.from(nomes);
}

describe('a landing só cita template que o wizard oferece', () => {
  it('todo nome da vitrine está na lista TEMPLATES do wizard', () => {
    const oferta = rotulosDoWizard();
    for (const nome of nomesNaLanding()) {
      expect(
        oferta,
        `a landing vende "${nome}", que não está na oferta do wizard`,
      ).toContain(nome);
    }
  });

  it('a vitrine cita QUATRO templates, como a copy promete', () => {
    // A copy diz "4 templates prontos" e "Quatro templates pra escolher" — o
    // número e a lista não podem divergir.
    expect(nomesNaLanding()).toHaveLength(4);
    expect(semComentarios(landing)).toContain('4 templates prontos');
  });

  it('o `minimalist` continua fora: existe no editor, não na oferta', () => {
    expect(semComentarios(landing)).not.toContain('Minimalista');
  });
});

describe('o Atelier saiu da vitrine', () => {
  it('nenhuma copy visível da landing cita o Atelier', () => {
    // Os comentários PODEM citá-lo: eles registram por que o card mudou, e essa
    // história é o que impede alguém de "restaurar" o Atelier sem contexto.
    expect(semComentarios(landing)).not.toContain('Atelier');
  });

  it('nenhuma outra página de marketing cita o Atelier', () => {
    for (const pagina of ['precos', 'termos', 'privacidade', 'reembolso']) {
      const src = semComentarios(raiz(`app/(marketing)/${pagina}/page.tsx`));
      expect(src, `${pagina} cita o Atelier`).not.toContain('Atelier');
    }
  });
});

describe('o FlowLine ocupou o lugar, nos cinco pontos', () => {
  const copy = () => semComentarios(landing);

  it('aparece na frase do "Diga o tema"', () => {
    expect(copy()).toContain('escolha o template: Profile, FlowLine, Manifesto ou Radar');
  });

  it('aparece no grid do MockTemplates', () => {
    expect(copy()).toContain("const templates = ['Profile', 'FlowLine', 'Manifesto', 'Radar']");
  });

  it('aparece nos dois bullets das FEATURES', () => {
    expect(copy()).toContain('4 templates prontos: Profile (cara de thread do X), FlowLine, Manifesto e Radar');
    expect(copy()).toContain("'Profile, FlowLine, Manifesto e Radar'");
  });

  it('tem o card do showcase, com o rótulo e o degradê do template', () => {
    const c = copy();
    expect(c).toContain('>FlowLine</span>');
    // O degradê é o que caracteriza o FlowLine — o card do Atelier era preto
    // chapado. Ver o comentário do card na landing.
    expect(c).toContain('linear-gradient(180deg, #3A3A3A 0%, #000000 100%)');
  });
});
