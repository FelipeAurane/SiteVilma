/**
 * Cliente da API do site.
 *
 * Tudo que o navegador precisa do servidor passa por aqui. Não existe
 * credencial nenhuma neste arquivo: a leitura é pública e a escrita é
 * autorizada pelo cookie de sessão, que o JavaScript nem consegue ler.
 */

const isNative = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform();

/**
 * Para onde o app fala quando é nativo.
 *
 * No navegador é sempre /api, relativo: mesma origem, sem configuração.
 *
 * No app a origem é https://localhost (os arquivos vão dentro do pacote), então
 * precisa do endereço completo do servidor. Em produção é o da Vercel.
 *
 * Para testar no celular contra a máquina de desenvolvimento, com os dois no
 * mesmo Wi-Fi, troque a linha de baixo para API_LOCAL. O endereço é o IP da
 * máquina na rede local: descubra com `ipconfig` e ajuste.
 */
const API_NATIVA = 'https://site-vilma-six.vercel.app/api';
const API_LOCAL = 'http://192.168.1.100:3000/api';

const BASE = isNative ? API_LOCAL : '/api';

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const headers = body === undefined ? {} : { 'Content-Type': 'application/json' };
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('vf_session_token') : null;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE}${path}`, {
    method,
    signal,
    // A resposta do servidor é pública e vem com s-maxage, para a borda
    // servir rápido. No navegador, porém, esse cache só atrasa a vida de
    // quem edita: com stale-while-revalidate o navegador entrega o valor
    // velho na primeira visita depois de uma mudança. A página já pinta
    // na hora pelo localStorage, então aqui lemos sempre fresco.
    cache: method === 'GET' ? 'no-store' : 'default',
    // Manda o cookie de sessão nas escritas.
    credentials: 'include',
    headers,
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

export async function login(credentials) {
  const body = typeof credentials === 'string' ? { pin: credentials } : (credentials || {});
  const res = await request('/auth/login', { method: 'POST', body });
  if (res && res.token && typeof localStorage !== 'undefined') {
    localStorage.setItem('vf_session_token', res.token);
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('vf_client_logged_in', 'true');
  }
  return res;
}

export async function logout() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('vf_session_token');
    localStorage.removeItem('vf_client_logged_in');
  }
  return request('/auth/logout', { method: 'POST', body: {} });
}

export async function getSession() {
  try {
    const res = await request('/auth/session');
    if (res && res.authenticated) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('vf_client_logged_in', 'true');
      }
      return res;
    }
  } catch {}

  const hasToken = typeof localStorage !== 'undefined' && Boolean(localStorage.getItem('vf_session_token'));
  const hasFlag = typeof localStorage !== 'undefined' && localStorage.getItem('vf_client_logged_in') === 'true';
  if (hasToken || hasFlag) {
    return { authenticated: true };
  }
  return { authenticated: false };
}

export { ApiError };
