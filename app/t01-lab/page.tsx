'use client';

import { useState } from 'react';
import {
  TEMPLATE_01_HEIGHT,
  TEMPLATE_01_MODELS,
  TEMPLATE_01_WIDTH,
  template01CornerSlots,
  template01Measure,
  template01NewSlideSlots,
  template01SlotsForSlide,
  template01SlotsFromContent,
} from '@/lib/templates/template-01';
import Template01Slide from '@/components/slides/Template01Slide';
import Template01ModelPicker from '@/components/editor/Template01ModelPicker';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_SLIDE, Slide } from '@/types';

/**
 * BANCADA DE INSPEÇÃO do TEMPLATE 1 — só desenvolvimento.
 *
 * O editor de verdade exige sessão e Supabase; esta página existe para medir o
 * render VIVO (o reflow depende de `useLayoutEffect` + medição de fonte, que o
 * SSR não executa) e para tirar as evidências de tela. Em produção não renderiza
 * nada.
 *
 * Cenários, por `?cena=`:
 *   gabarito — os 6 slides SEM `templateSlots`: cai no texto do Figma, que é o
 *              gabarito de 0 px contra o `reference/slideN.png`.
 *   legado   — os 6 slides sem `templateModel`, como um deck salvo ANTES da
 *              mudança. Tem de sair idêntico ao gabarito.
 *   modelo   — os mesmos 6, agora com `templateModel` explícito.
 *   deck8    — 8 slides com modelo repetido, o caso que quebrava.
 *   novo     — um slide novo de cada modelo, com o lorem.
 *   popup    — o popup de escolha de modelo.
 */

const CENAS = ['gabarito', 'legado', 'modelo', 'deck8', 'novo', 'popup'] as const;
type Cena = (typeof CENAS)[number];

function base(position: number): Slide {
  return {
    ...DEFAULT_SLIDE,
    id: `lab-${position}`,
    position,
    backgroundImageUrl: '',
    gridImageUrl: '',
    contentImageUrl: '',
  } as Slide;
}

export default function T01Lab() {
  const [cena, setCena] = useState<Cena>('gabarito');
  const [picked, setPicked] = useState<string>('');

  if (process.env.NODE_ENV === 'production') return null;

  let slides: Slide[];
  if (cena === 'deck8') {
    slides = [1, 2, 3, 4, 5, 6, 3, 1].map((model, i) => ({
      ...base(i),
      templateModel: model,
      templateSlots: {
        ...template01NewSlideSlots(model),
        ...template01CornerSlots('MINHA MARCA', 'eu'),
      },
    }));
  } else if (cena === 'novo') {
    slides = TEMPLATE_01_MODELS.map((model, i) => ({
      ...base(i),
      templateModel: model,
      templateSlots: {
        ...template01NewSlideSlots(model),
        ...template01CornerSlots('MINHA MARCA', 'eu'),
      },
    }));
  } else if (cena === 'modelo') {
    slides = TEMPLATE_01_MODELS.map((model, i) => ({ ...base(i), templateModel: model }));
  } else {
    // gabarito e legado são a MESMA coisa hoje: slide sem modelo gravado.
    slides = TEMPLATE_01_MODELS.map((_, i) => base(i));
  }

  return (
    <div style={{ background: '#222', minHeight: '100vh', padding: 24 }}>
      <div
        data-testid="lab-toolbar"
        style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}
      >
        {CENAS.map((c) => (
          <button
            key={c}
            onClick={() => setCena(c)}
            data-cena={c}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid #555',
              background: c === cena ? '#fff' : '#333',
              color: c === cena ? '#000' : '#ccc',
              font: '12px system-ui',
            }}
          >
            {c}
          </button>
        ))}
        <span style={{ color: '#8f8', font: '12px monospace', alignSelf: 'center' }}>{picked}</span>
      </div>

      {cena === 'popup' ? (
        <Template01ModelPicker
          globalSettings={DEFAULT_GLOBAL_SETTINGS}
          inheritedCorners={template01CornerSlots('MINHA MARCA', 'eu')}
          baseSlide={base(0)}
          onPick={(patch) => setPicked(`escolhido: modelo ${patch.templateModel}`)}
          onClose={() => setCena('gabarito')}
        />
      ) : (
        <div id="lab-deck" style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
          {slides.map((slide, i) => (
            <div key={slide.id} data-slide-position={i} data-slide-model={slide.templateModel ?? ''}>
              <div style={{ color: '#aaa', font: '12px monospace', marginBottom: 4 }}>
                pos {i} · modelo {slide.templateModel ?? '(da posição)'}
              </div>
              {/* Escala NATIVA: 1080x1350 sem transform, senão a medida do
                  reflow sai de um layout escalado e não vale como fidelidade. */}
              <div
                data-native-slide={i}
                style={{ width: TEMPLATE_01_WIDTH, height: TEMPLATE_01_HEIGHT, overflow: 'hidden' }}
              >
                <Template01Slide
                  slide={slide}
                  globalSettings={DEFAULT_GLOBAL_SETTINGS}
                  slideIndex={i}
                  totalSlides={slides.length}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {cena === 'novo' && (
        <div id="lab-contadores" style={{ marginTop: 24, color: '#ddd', font: '12px monospace' }}>
          {TEMPLATE_01_MODELS.map((model) => {
            const slots = template01NewSlideSlots(model);
            const linhas = template01SlotsForSlide(model)
              .filter((d) => d.kind === 'text' && !d.slot.startsWith('cantos.'))
              .map((d) => {
                const m = template01Measure(slots[d.slot], d);
                return { slot: d.slot, over: m.over, txt: `${m.chars}/${m.charBudget ?? '—'}` };
              });
            return (
              <div key={model} style={{ marginBottom: 6 }}>
                <b>modelo {model}</b>{' '}
                {linhas.map((l) => (
                  <span key={l.slot} data-contador={l.slot} data-over={String(l.over)} style={{ color: l.over ? '#f55' : '#8f8', marginRight: 12 }}>
                    {l.slot} {l.txt}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Prova de que a GERAÇÃO continua fechada em 6, um por modelo. */}
      <pre id="lab-geracao" style={{ color: '#888', font: '11px monospace', marginTop: 24 }}>
        {JSON.stringify(
          TEMPLATE_01_MODELS.map((m, i) => ({
            posicao: i,
            modelo: i + 1,
            slots: Object.keys(template01SlotsFromContent(i, { title: 't', description: 'd' })),
          })),
          null,
          1
        )}
      </pre>
    </div>
  );
}
