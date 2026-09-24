/**
 * Cliente da API do site.
 *
 * Tudo que o navegador precisa do servidor passa por aqui. Não existe
 * credencial nenhuma neste arquivo: a leitura é pública e a escrita é
 * autorizada pelo cookie de sessão, que o JavaScript nem consegue ler.
 */

const isNative = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform();
const BASE = isNative ? 'https://site-vilma-six.vercel.app/api' : '/api';

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    signal,
    // Manda o cookie de sessão nas escritas.
    credentials: 'include',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Resposta sem JSON: trata pelo status abaixo.
  }

  if (!response.ok) {
    throw new ApiError(payload?.error || `Erro ${response.status}`, response.status);
  }

  return payload;
}

// ------------------------------------------------------------- conteúdo

export async function getContent(key) {
  const payload = await request(`/content?key=${encodeURIComponent(key)}`);
  return payload?.value ?? null;
}

export async function getContentWithMeta(key) {
  return request(`/content?key=${encodeURIComponent(key)}`);
}

export async function putContent(key, value) {
  return request('/content', { method: 'PUT', body: { key, value } });
}

// ---------------------------------------------------------------- mídia

/**
 * Reduz a imagem antes de enviar. Um JPEG de 1280px fica na casa das
 * centenas de KB, bem abaixo do limite do servidor.
 */
export function compressImage(file, { maxSize = 1280, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('O arquivo não é uma imagem.'));
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível comprimir a imagem.'))),
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível ler a imagem.'));
    };

    img.src = url;
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result);
      // Tira o prefixo "data:image/jpeg;base64,".
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(blob);
  });
}

/** Envia a imagem e devolve a URL servida pelo nosso domínio. */
export async function uploadImage(file) {
  const blob = await compressImage(file);
  const data = await blobToBase64(blob);
  const payload = await request('/media', { method: 'POST', body: { mime: 'image/jpeg', data } });
  return payload.url;
}

const VIDEOS_ACEITOS = { 'video/mp4': true, 'video/webm': true };

/** Teto do servidor para vídeo; conferido aqui para o aviso ser imediato. */
export const LIMITE_VIDEO_BYTES = 3 * 1024 * 1024;

/**
 * Envia imagem ou vídeo. Imagem passa pela compressão do canvas; vídeo vai
 * como está, porque o navegador não recomprime vídeo — por isso o arquivo
 * precisa já vir pequeno.
 */
export async function uploadMedia(file) {
  if (!file) throw new Error('Nenhum arquivo escolhido.');

  if (file.type.startsWith('image/')) {
    return { url: await uploadImage(file), tipo: 'imagem' };
  }

  if (!VIDEOS_ACEITOS[file.type]) {
    throw new Error('Formato não aceito. Use JPEG, PNG, WebP, MP4 ou WebM.');
  }

  if (file.size > LIMITE_VIDEO_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    throw new Error(
      `O vídeo tem ${mb}MB e o limite é ${(LIMITE_VIDEO_BYTES / 1024 / 1024).toFixed(0)}MB. ` +
      'Use um loop curto e bem comprimido.'
    );
  }

  const data = await blobToBase64(file);
  const payload = await request('/media', { method: 'POST', body: { mime: file.type, data } });
  return { url: payload.url, tipo: 'video' };
}

// -------------------------------------------------------------- sessão

export async function login(password) {
  return request('/auth/login', { method: 'POST', body: { password } });
}

export async function logout() {
  return request('/auth/logout', { method: 'POST', body: {} });
}

export async function getSession() {
  try {
    return await request('/auth/session');
  } catch {
    return { authenticated: false };
  }
}

export { ApiError };
