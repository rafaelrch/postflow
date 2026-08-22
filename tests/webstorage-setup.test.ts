// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * O POLYFILL DE WEBSTORAGE (tests/setup/webstorage.ts).
 *
 * O vitest 4 não copia `localStorage`/`sessionStorage` do window do jsdom para
 * o global, e por isso dois testes de onboarding falhavam há semanas com
 * "Cannot read properties of undefined". O setup repõe as duas.
 *
 * Estes testes travam o CONTRATO da Storage — os detalhes em que um polyfill
 * ingênuo erra e que só aparecem como bug esquisito num teste alheio: chave
 * ausente é `null` e não `undefined`, o valor vira string, e as duas Storages
 * são caixas separadas.
 */

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('o ambiente de teste tem webstorage', () => {
  it('localStorage e sessionStorage existem no global e no window', () => {
    expect(typeof localStorage).toBe('object');
    expect(typeof sessionStorage).toBe('object');
    // O componente sob teste costuma escrever `window.localStorage`.
    expect(window.localStorage).toBeTruthy();
    expect(window.sessionStorage).toBeTruthy();
  });
});

describe('contrato da Storage', () => {
  it('chave ausente devolve null — nunca undefined', () => {
    // `undefined` aqui passaria por um `if (!valor)` e quebraria num
    // `JSON.parse(valor)`, que é o jeito mais comum de ler um rascunho.
    expect(localStorage.getItem('nao-existe')).toBeNull();
    expect(localStorage.getItem('nao-existe')).not.toBeUndefined();
  });

  it('setItem guarda e getItem devolve', () => {
    localStorage.setItem('rascunho', 'oi');
    expect(localStorage.getItem('rascunho')).toBe('oi');
  });

  it('o valor é convertido para STRING', () => {
    // A Storage de verdade não guarda número: quem gravar 7 lê '7'.
    localStorage.setItem('n', 7 as unknown as string);
    expect(localStorage.getItem('n')).toBe('7');
    localStorage.setItem('b', false as unknown as string);
    expect(localStorage.getItem('b')).toBe('false');
  });

  it('removeItem apaga só a chave pedida', () => {
    localStorage.setItem('a', '1');
    localStorage.setItem('b', '2');
    localStorage.removeItem('a');
    expect(localStorage.getItem('a')).toBeNull();
    expect(localStorage.getItem('b')).toBe('2');
  });

  it('clear esvazia tudo', () => {
    localStorage.setItem('a', '1');
    localStorage.setItem('b', '2');
    localStorage.clear();
    expect(localStorage.length).toBe(0);
    expect(localStorage.getItem('a')).toBeNull();
  });

  it('length conta as chaves, e regravar a mesma chave não soma', () => {
    expect(localStorage.length).toBe(0);
    localStorage.setItem('a', '1');
    localStorage.setItem('b', '2');
    expect(localStorage.length).toBe(2);
    localStorage.setItem('a', 'outro');
    expect(localStorage.length).toBe(2);
  });

  it('key(i) devolve a chave do índice, e null fora da faixa', () => {
    localStorage.setItem('a', '1');
    localStorage.setItem('b', '2');
    expect(localStorage.key(0)).toBe('a');
    expect(localStorage.key(1)).toBe('b');
    expect(localStorage.key(9)).toBeNull();
  });
});

describe('as duas Storages são caixas separadas', () => {
  it('escrever numa não aparece na outra', () => {
    localStorage.setItem('chave', 'do-local');
    sessionStorage.setItem('chave', 'da-sessao');
    expect(localStorage.getItem('chave')).toBe('do-local');
    expect(sessionStorage.getItem('chave')).toBe('da-sessao');
  });

  it('limpar uma NÃO limpa a outra', () => {
    // Um Map compartilhado passaria em tudo acima e cairia só aqui — por isso
    // este teste existe.
    localStorage.setItem('a', '1');
    sessionStorage.setItem('a', '1');
    localStorage.clear();
    expect(localStorage.getItem('a')).toBeNull();
    expect(sessionStorage.getItem('a')).toBe('1');
  });
});
