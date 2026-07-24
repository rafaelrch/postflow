import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLoad, mockWriteFile, mockExec, mockReadFile, mockDeleteFile, mockOn, execArgsSpy } =
  vi.hoisted(() => ({
    mockLoad: vi.fn(),
    mockWriteFile: vi.fn(),
    mockExec: vi.fn(),
    mockReadFile: vi.fn(),
    mockDeleteFile: vi.fn(),
    mockOn: vi.fn(),
    execArgsSpy: vi.fn(),
  }));

vi.mock('@ffmpeg/ffmpeg', () => ({
  FFmpeg: class {
    load = mockLoad;
    writeFile = mockWriteFile;
    exec = (args: string[]) => {
      execArgsSpy(args);
      return mockExec(args);
    };
    readFile = mockReadFile;
    deleteFile = mockDeleteFile;
    on = mockOn;
  },
}));

vi.mock('@ffmpeg/util', () => ({
  toBlobURL: vi.fn(async () => 'blob:core'),
  fetchFile: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));

import {
  buildFfmpegArgs,
  toEven,
  composeReelVideo,
  sanitizeReelFilename,
  computeReelLayout,
} from '../lib/reels-export';

describe('computeReelLayout — bloco centrado verticalmente (letterbox simétrico)', () => {
  it('vídeo landscape 16:9: ajuste-à-largura e sobra preta IGUAL em cima/baixo', () => {
    // 1080 * 9/16 = 607.5 -> par 606. header 400. bloco 1006. pad (1920-1006)/2=457 -> 456.
    const l = computeReelLayout({ headerHeight: 400, videoWidth: 1920, videoHeight: 1080 });
    expect(l.headerHeight).toBe(400);
    expect(l.videoBoxHeight).toBe(606);
    expect(l.blockHeight).toBe(1006);
    expect(l.padY).toBe(456);
    // Simétrico: padY em cima e embaixo cabe no card.
    expect(2 * l.padY + l.blockHeight).toBeLessThanOrEqual(1920);
  });

  it('vídeo quadrado 1:1: caixa = 1080, bloco centrado', () => {
    const l = computeReelLayout({ headerHeight: 400, videoWidth: 1080, videoHeight: 1080 });
    expect(l.videoBoxHeight).toBe(1080);
    expect(l.blockHeight).toBe(1480);
    expect(l.padY).toBe(220);
  });

  it('vídeo MUITO alto (portrait 9:16): clampa na altura restante, sem estourar o card', () => {
    // widthFit = 1080*1920/1080 = 1920 > avail(1920-400=1520) -> clampa em 1520.
    const l = computeReelLayout({ headerHeight: 400, videoWidth: 1080, videoHeight: 1920 });
    expect(l.videoBoxHeight).toBe(1520);
    expect(l.blockHeight).toBe(1920);
    expect(l.padY).toBe(0);
  });

  it('sem dimensões nativas (mas com vídeo): cai no fallback (preenche a altura restante)', () => {
    const l = computeReelLayout({ headerHeight: 400 });
    expect(l.videoBoxHeight).toBe(1520);
    expect(l.padY).toBe(0);
  });

  it('SEM vídeo (hasVideo=false): caixa 0 e só o cabeçalho centrado (novo reel)', () => {
    // header 400 -> bloco 400 -> room 1520 -> centro 760. Perfil no centro, não no topo.
    const l = computeReelLayout({ headerHeight: 400, hasVideo: false });
    expect(l.videoBoxHeight).toBe(0);
    expect(l.blockHeight).toBe(400);
    expect(l.padY).toBe(760);
    expect(2 * l.padY + l.blockHeight).toBe(1920);
  });

  it('todas as dimensões retornadas são PARES', () => {
    const l = computeReelLayout({ headerHeight: 401, videoWidth: 1280, videoHeight: 719 });
    for (const v of [l.headerHeight, l.videoBoxHeight, l.padY, l.blockHeight, l.offsetY]) {
      expect(v % 2).toBe(0);
    }
  });

  it('sem offset: bloco centrado (offsetY 0, padY = centro)', () => {
    const l = computeReelLayout({ headerHeight: 400, videoWidth: 1920, videoHeight: 1080 });
    expect(l.offsetY).toBe(0);
    expect(l.padY).toBe(456);
  });
});

describe('computeReelLayout — offset vertical (mover o bloco cima/baixo)', () => {
  // landscape 16:9 com header 400: VB 606, bloco 1006, room 914, centro 456.
  const base = { headerHeight: 400, videoWidth: 1920, videoHeight: 1080 } as const;

  it('offset POSITIVO desce o bloco: padY = centro + offset, offsetY aplicado', () => {
    const l = computeReelLayout({ ...base, offsetY: 200 });
    expect(l.padY).toBe(656); // 456 + 200
    expect(l.offsetY).toBe(200);
  });

  it('offset NEGATIVO sobe o bloco', () => {
    const l = computeReelLayout({ ...base, offsetY: -200 });
    expect(l.padY).toBe(256); // 456 - 200
    expect(l.offsetY).toBe(-200);
  });

  it('CLAMPA para baixo: nunca vaza a base (padY ≤ room, sobra de baixo ≥ 0)', () => {
    const l = computeReelLayout({ ...base, offsetY: 1000 });
    expect(l.padY).toBe(914); // room, cola na base
    expect(l.offsetY).toBe(458); // 914 - 456
    expect(l.padY + l.blockHeight).toBeLessThanOrEqual(1920);
  });

  it('CLAMPA para cima: nunca vaza o topo (padY ≥ 0)', () => {
    const l = computeReelLayout({ ...base, offsetY: -1000 });
    expect(l.padY).toBe(0); // cola no topo
    expect(l.offsetY).toBe(-456);
  });

  it('vídeo que PREENCHE o card (room 0): offset não tem efeito', () => {
    const l = computeReelLayout({ headerHeight: 400, videoWidth: 1080, videoHeight: 1920, offsetY: 300 });
    expect(l.blockHeight).toBe(1920);
    expect(l.padY).toBe(0);
    expect(l.offsetY).toBe(0);
  });
});

describe('sanitizeReelFilename — nome do download', () => {
  it('sempre termina em .mp4', () => {
    expect(sanitizeReelFilename('meu-reel')).toBe('meu-reel.mp4');
    expect(sanitizeReelFilename('video.mp4')).toBe('video.mp4');
    expect(sanitizeReelFilename('VIDEO.MP4')).toBe('VIDEO.mp4');
  });

  it('troca espaços por hífen e remove caracteres inválidos', () => {
    expect(sanitizeReelFilename('Meu Reel!! @2026')).toBe('Meu-Reel-2026.mp4');
    expect(sanitizeReelFilename('a/b\\c:d*e')).toBe('abcde.mp4');
  });

  it('remove emoji/acentos fora do conjunto seguro', () => {
    // Acentos e emoji não estão no conjunto [a-zA-Z0-9-_ ] → removidos.
    expect(sanitizeReelFilename('féé 🚀 test')).toBe('f-test.mp4');
  });

  it('vazio/só-inválido cai em reel.mp4', () => {
    expect(sanitizeReelFilename('')).toBe('reel.mp4');
    expect(sanitizeReelFilename('   ')).toBe('reel.mp4');
    expect(sanitizeReelFilename('!!!')).toBe('reel.mp4');
    expect(sanitizeReelFilename(undefined)).toBe('reel.mp4');
  });

  it('não deixa hífens duplicados nem nas bordas', () => {
    expect(sanitizeReelFilename('--a---b--')).toBe('a-b.mp4');
  });
});

describe('buildFfmpegArgs — vstack + pad centralizado', () => {
  const base = {
    width: 1080,
    cardHeight: 1920,
    headerHeight: 400,
    videoBoxHeight: 606,
    padY: 456,
    inputName: 'input.mp4',
    headerName: 'header.png',
    outputName: 'reel.mp4',
  };

  const filterOf = (over: Partial<typeof base> & { muted: boolean }) => {
    const args = buildFfmpegArgs({ ...base, ...over });
    return args[args.indexOf('-filter_complex') + 1];
  };

  it('empilha cabeçalho EM CIMA do vídeo (vstack [hdr][vid])', () => {
    expect(filterOf({ muted: false })).toContain('[hdr][vid]vstack=inputs=2[stacked]');
  });

  it('escala o vídeo com contain (nunca deforma) e centra o vídeo na sua caixa', () => {
    const filter = filterOf({ muted: false });
    expect(filter).toContain('force_original_aspect_ratio=decrease');
    expect(filter).toContain('pad=1080:606:(ow-iw)/2:(oh-ih)/2:color=black');
  });

  it('pad FINAL centraliza o bloco no card 1080x1920 com padY simétrico (NÃO no topo)', () => {
    const filter = filterOf({ muted: false });
    expect(filter).toContain('[stacked]pad=1080:1920:0:456:color=black[outv]');
    // Não pode colar no topo (padY 0) quando há sobra.
    expect(filter).not.toContain('pad=1080:1920:0:0:color=black');
  });

  it('padY deslocado pelo offset entra no y do pad final (bloco movido no MP4)', () => {
    // padY 656 = centro 456 + offset 200 -> o bloco desce no export igual ao preview.
    const filter = filterOf({ padY: 656, muted: true });
    expect(filter).toContain('[stacked]pad=1080:1920:0:656:color=black[outv]');
  });

  it('saída sempre em yuv420p/libx264 e faststart', () => {
    const args = buildFfmpegArgs({ ...base, muted: false });
    expect(args[args.indexOf('-pix_fmt') + 1]).toBe('yuv420p');
    expect(args).toContain('libx264');
    expect(args).toContain('+faststart');
  });

  it('mute=true => -an e sem faixa de áudio', () => {
    const args = buildFfmpegArgs({ ...base, muted: true });
    expect(args).toContain('-an');
    expect(args).not.toContain('0:a?');
    expect(args).not.toContain('aac');
  });

  it('mute=false => mapeia áudio opcional 0:a? em aac', () => {
    const args = buildFfmpegArgs({ ...base, muted: false });
    expect(args).toContain('0:a?');
    expect(args).toContain('aac');
    expect(args).not.toContain('-an');
  });

  it('força dimensões PARES (yuv420p exige)', () => {
    const filter = filterOf({ width: 1081, headerHeight: 401, videoBoxHeight: 605, padY: 457, muted: true });
    expect(filter).toContain('scale=1080:400'); // header 401->400
    expect(filter).toContain('scale=1080:604'); // vídeo 605->604
    expect(filter).toContain('pad=1080:1920:0:456:color=black'); // padY 457->456
  });
});

describe('toEven', () => {
  it('arredonda para baixo até o par', () => {
    expect(toEven(400)).toBe(400);
    expect(toEven(401)).toBe(400);
    expect(toEven(1519)).toBe(1518);
  });
});

describe('composeReelVideo — produz um Blob MP4 não-vazio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockResolvedValue(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])); // "MP4" fake
  });

  it('escreve entradas, roda o exec e devolve video/mp4 com bytes', async () => {
    const blob = await composeReelVideo({
      videoBlob: new Blob([new Uint8Array([9, 9, 9])], { type: 'video/mp4' }),
      videoExt: 'mp4',
      headerPng: new Blob([new Uint8Array([1])], { type: 'image/png' }),
      headerHeight: 400,
      videoWidth: 1920,
      videoHeight: 1080,
      muted: false,
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('video/mp4');
    expect(blob.size).toBeGreaterThan(0);

    // Escreveu vídeo + cabeçalho no FS virtual e chamou o encode.
    expect(mockWriteFile).toHaveBeenCalledTimes(2);
    expect(execArgsSpy).toHaveBeenCalledTimes(1);
    expect(mockReadFile).toHaveBeenCalledWith('reel.mp4');
  });

  it('usa extensão .webm no arquivo de entrada quando o vídeo é WebM', async () => {
    await composeReelVideo({
      videoBlob: new Blob([new Uint8Array([9])], { type: 'video/webm' }),
      videoExt: 'webm',
      headerPng: new Blob([new Uint8Array([1])], { type: 'image/png' }),
      headerHeight: 400,
      videoWidth: 1080,
      videoHeight: 1080,
      muted: true,
    });
    const firstWrite = mockWriteFile.mock.calls[0][0] as string;
    expect(firstWrite).toBe('input.webm');
  });
});
