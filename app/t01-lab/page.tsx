'use client';

import { useEffect, useState } from 'react';
import EditorSidebar from '@/components/editor/EditorSidebar';
import { useEditorStore } from '@/hooks/useEditorStore';
import { FORMAT_LIST, getFormat } from '@/lib/formats';
import { SlideFormat } from '@/types';
import {
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
 *   barra    — a BARRA LATERAL de verdade ao lado do slide ativo. O editor
 *              exige sessão; a barra não, porque lê só a store do Zustand.
 *              É por aqui que se vê o painel mexendo no slide de fato.
 */

const CENAS = ['gabarito', 'legado', 'modelo', 'deck8', 'novo', 'popup', 'barra'] as const;
type Cena = (typeof CENAS)[number];

/**
 * A barra lateral ao vivo, com o slide ativo do lado. Sem sessão e sem
 * Supabase: a barra só conversa com a store.
 */
function LabBarra({ formato, escala }: { formato: SlideFormat; escala: number }) {
  const { slides, activeSlideIndex, globalSettings, setActiveSlideIndex } = useEditorStore();
  const slide = slides[activeSlideIndex];
  const fmt = getFormat(formato);
  if (!slide) return null;

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <div style={{ height: 900, background: 'var(--surface, #fff)' }}>
        <EditorSidebar onOpenWizard={() => {}} onDownloadSlide={() => {}} onDownloadAll={() => {}} />
      </div>
      <div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {slides.map((s, i) => (
            <button
              key={s.id}
              data-barra-slide={i}
              onClick={() => setActiveSlideIndex(i)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid #555',
                background: i === activeSlideIndex ? '#fa0' : '#333',
                color: i === activeSlideIndex ? '#000' : '#ccc',
                font: '12px system-ui',
              }}
            >
              s{i + 1}
            </button>
          ))}
        </div>
        <div style={{ width: TEMPLATE_01_WIDTH * escala, height: fmt.height * escala, overflow: 'hidden' }}>
          <div
            data-native-slide={activeSlideIndex}
            style={{
              width: TEMPLATE_01_WIDTH,
              height: fmt.height,
              transformOrigin: 'top left',
              transform: `scale(${escala})`,
            }}
          >
            <Template01Slide
              slide={slide}
              globalSettings={{ ...globalSettings, format: formato }}
              slideIndex={activeSlideIndex}
              totalSlides={slides.length}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const [formato, setFormato] = useState<SlideFormat>('4:5');
  // Escala só da MOLDURA de inspeção: entra num wrapper por fora do slide, como
  // no `SlidePreview`. O slide continua renderizando em px nativos — é ele que o
  // reflow mede, e medir um layout já escalado invalidaria a fidelidade.
  const [escala, setEscala] = useState(1);
  // `solo` isola UM slide na tela — é assim que as evidências saem uma a uma,
  // sem depender de rolagem.
  const [solo, setSolo] = useState<number | null>(null);
  const [picked, setPicked] = useState<string>('');

  // A cena `barra` semeia a store uma vez ao entrar. Não depende de `solo`: a
  // troca de slide ativo é da própria barra, e re-semear apagaria a edição.
  useEffect(() => {
    if (cena !== 'barra') return;
    useEditorStore.setState({
      slides: TEMPLATE_01_MODELS.map((model, i) => ({
        ...base(i),
        templateModel: model,
        templateSlots: {
          ...template01NewSlideSlots(model),
          ...template01CornerSlots('MINHA MARCA', 'eu'),
        },
      })),
      activeSlideIndex: 5,
      style: 'template01',
      globalSettings: DEFAULT_GLOBAL_SETTINGS,
    });
  }, [cena]);

  if (process.env.NODE_ENV === 'production') return null;

  // O formato é ajuste de DECK: entra pelo globalSettings, como no editor.
  const fmt = getFormat(formato);
  const settings = { ...DEFAULT_GLOBAL_SETTINGS, format: formato };

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
        <span style={{ color: '#555', alignSelf: 'center' }}>|</span>
        {FORMAT_LIST.map((f) => (
          <button
            key={f.id}
            onClick={() => setFormato(f.id)}
            data-formato={f.id}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid #555',
              background: f.id === formato ? '#8f8' : '#333',
              color: f.id === formato ? '#000' : '#ccc',
              font: '12px system-ui',
            }}
          >
            {f.id}
          </button>
        ))}
        <span style={{ color: '#555', alignSelf: 'center' }}>|</span>
        {[1, 0.6, 0.5, 0.4].map((e) => (
          <button
            key={e}
            onClick={() => setEscala(e)}
            data-escala={e}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid #555',
              background: e === escala ? '#88f' : '#333',
              color: e === escala ? '#000' : '#ccc',
              font: '12px system-ui',
            }}
          >
            {e}×
          </button>
        ))}
        <span style={{ color: '#555', alignSelf: 'center' }}>|</span>
        {[null, 0, 1, 2, 3, 4, 5].map((s) => (
          <button
            key={String(s)}
            onClick={() => setSolo(s)}
            data-solo={String(s)}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid #555',
              background: s === solo ? '#fa0' : '#333',
              color: s === solo ? '#000' : '#ccc',
              font: '12px system-ui',
            }}
          >
            {s == null ? 'todos' : `s${s + 1}`}
          </button>
        ))}
        <span style={{ color: '#8f8', font: '12px monospace', alignSelf: 'center' }}>{picked}</span>
      </div>

      {cena === 'barra' ? (
        <LabBarra formato={formato} escala={escala} />
      ) : cena === 'popup' ? (
        <Template01ModelPicker
          globalSettings={DEFAULT_GLOBAL_SETTINGS}
          inheritedCorners={template01CornerSlots('MINHA MARCA', 'eu')}
          baseSlide={base(0)}
          onPick={(patch) => setPicked(`escolhido: modelo ${patch.templateModel}`)}
          onClose={() => setCena('gabarito')}
        />
      ) : (
        <div id="lab-deck" style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
          {(solo == null ? slides : [slides[solo]]).map((slide, k) => {
          const i = solo ?? k;
          return (
            <div key={slide.id} data-slide-position={i} data-slide-model={slide.templateModel ?? ''}>
              <div style={{ color: '#aaa', font: '12px monospace', marginBottom: 4 }}>
                pos {i} · modelo {slide.templateModel ?? '(da posição)'}
              </div>
              {/* Escala NATIVA: a altura do formato sem transform, senão a
                  medida do reflow sai de um layout escalado e não vale como
                  fidelidade. */}
              <div
                style={{
                  width: TEMPLATE_01_WIDTH * escala,
                  height: fmt.height * escala,
                  overflow: 'hidden',
                }}
              >
                <div
                  data-native-slide={i}
                  data-formato={fmt.id}
                  style={{
                    width: TEMPLATE_01_WIDTH,
                    height: fmt.height,
                    overflow: 'hidden',
                    transformOrigin: 'top left',
                    transform: `scale(${escala})`,
                  }}
                >
                  {/* `key` força REMONTAR ao trocar escala/formato. O reflow
                      mede no `useLayoutEffect` e re-registra o ResizeObserver a
                      cada render: mudar o tamanho renderizado com o componente
                      montado realimenta a medição. Montar de novo é o que o
                      editor já faz na prática (o `scale` do `SlidePreview` é
                      fixado antes do mount). */}
                  <Template01Slide
                    key={`${formato}-${escala}`}
                    slide={slide}
                    globalSettings={settings}
                    slideIndex={i}
                    totalSlides={slides.length}
                  />
                </div>
              </div>
            </div>
          );
          })}
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
