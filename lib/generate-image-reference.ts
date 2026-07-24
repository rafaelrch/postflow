import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

const REFERENCE_BUCKET = 'postflow-assets';
const REFERENCE_FOLDER = 'reference-images';
const REFERENCE_TIMEOUT_MS = 10_000;
const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
const ALLOWED_REFERENCE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function isPrivateIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function mappedIpv4(address: string): string | null {
  const normalized = address.toLowerCase();
  const expandedPrefix = /^(?:0:){5}ffff:/;
  if (!normalized.startsWith('::ffff:') && !expandedPrefix.test(normalized)) return null;
  const tail = normalized.startsWith('::ffff:')
    ? normalized.slice('::ffff:'.length)
    : normalized.replace(expandedPrefix, '');
  if (tail.includes('.')) return tail;
  const parts = tail.split(':');
  if (parts.length !== 2) return null;
  const high = Number.parseInt(parts[0], 16);
  const low = Number.parseInt(parts[1], 16);
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null;
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function isPrivateAddress(address: string): boolean {
  const unwrapped = address.replace(/^\[|\]$/g, '').toLowerCase();
  const family = isIP(unwrapped);
  if (family === 4) return isPrivateIpv4(unwrapped);
  if (family !== 6) return true;

  const mapped = mappedIpv4(unwrapped);
  if (mapped) return isPrivateIpv4(mapped);
  return (
    unwrapped === '::' ||
    unwrapped === '::1' ||
    unwrapped.startsWith('fc') ||
    unwrapped.startsWith('fd') ||
    /^fe[89ab]/.test(unwrapped)
  );
}

function validateReferenceUrl(rawUrl: string, userId: string): URL {
  let candidate: URL;
  let projectUrl: URL;
  try {
    candidate = new URL(rawUrl);
    projectUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '');
  } catch {
    throw new Error('URL de referência inválida');
  }

  if (candidate.protocol !== 'https:' || projectUrl.protocol !== 'https:') {
    throw new Error('A imagem de referência deve usar HTTPS');
  }
  if (candidate.username || candidate.password) {
    throw new Error('Credenciais na URL da imagem de referência não são permitidas');
  }
  if (candidate.origin !== projectUrl.origin || candidate.port !== projectUrl.port) {
    throw new Error('Origem da imagem de referência não permitida');
  }
  if (candidate.search || candidate.hash) {
    throw new Error('Parâmetros na URL da imagem de referência não são permitidos');
  }

  let segments: string[];
  try {
    segments = decodeURIComponent(candidate.pathname).split('/').filter(Boolean);
  } catch {
    throw new Error('Caminho da imagem de referência inválido');
  }
  const expected = ['storage', 'v1', 'object', 'public', REFERENCE_BUCKET, userId, REFERENCE_FOLDER];
  if (
    segments.length !== expected.length + 1 ||
    expected.some((segment, index) => segments[index] !== segment) ||
    !segments.at(-1) ||
    segments.at(-1) === '.' ||
    segments.at(-1) === '..'
  ) {
    throw new Error('Bucket ou caminho da imagem de referência não permitido');
  }
  return candidate;
}

export async function downloadReferenceImage(
  rawUrl: string,
  userId: string
): Promise<{ buffer: Buffer; mime: string }> {
  const url = validateReferenceUrl(rawUrl, userId);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(hostname) && isPrivateAddress(hostname)) {
    throw new Error('Endereço IP privado não permitido');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REFERENCE_TIMEOUT_MS);
  try {
    const abortPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener(
        'abort',
        () => reject(new Error('Timeout ao baixar imagem de referência')),
        { once: true }
      );
    });
    const addresses = await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      abortPromise,
    ]);
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
      throw new Error('DNS da imagem de referência resolveu para endereço privado');
    }

    // Usa o primeiro IP público de forma determinística e fixa a resolução da
    // própria conexão nesse endereço. Host e SNI continuam sendo o hostname
    // validado, mas não há um segundo lookup sujeito a DNS rebinding.
    const selected = addresses[0];
    const response = await new Promise<import('node:http').IncomingMessage>((resolve, reject) => {
      const request = httpsRequest(url, {
        method: 'GET',
        signal: controller.signal,
        servername: hostname,
        headers: {
          accept: 'image/png,image/jpeg,image/webp',
          host: url.host,
        },
        lookup: (_lookupHostname, _options, callback) => {
          callback(null, selected.address, selected.family);
        },
      }, resolve);
      request.once('error', reject);
      request.end();
    });
    const status = response.statusCode ?? 0;
    if (status >= 300 && status < 400) {
      response.destroy();
      throw new Error('Redirect na imagem de referência não permitido');
    }
    if (status < 200 || status >= 300) {
      response.destroy();
      throw new Error(`Falha ao baixar a imagem de referência (${status})`);
    }

    const rawContentType = response.headers['content-type'];
    const mime = (Array.isArray(rawContentType) ? rawContentType[0] : rawContentType || '')
      .split(';', 1)[0].trim().toLowerCase();
    if (!ALLOWED_REFERENCE_MIMES.has(mime)) {
      response.destroy();
      throw new Error('MIME da imagem de referência não permitido');
    }
    const rawContentLength = response.headers['content-length'];
    const declaredLength = Number(Array.isArray(rawContentLength) ? rawContentLength[0] : rawContentLength);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REFERENCE_BYTES) {
      response.destroy();
      throw new Error('Imagem de referência excede o tamanho máximo');
    }

    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of response) {
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += value.length;
      if (total > MAX_REFERENCE_BYTES) {
        response.destroy();
        throw new Error('Imagem de referência excede o tamanho máximo');
      }
      chunks.push(value);
    }
    return { buffer: Buffer.concat(chunks), mime };
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Timeout ao baixar imagem de referência');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
