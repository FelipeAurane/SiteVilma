'use strict';
// Local-only showcase and end-to-end check. Never loads the project's .env database.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'src', 'img', 'demo-galerias');
const base = 'http://127.0.0.1:3199';
const names = [['Gastronomia', 8], ['Produtos', 5], ['Ensaios', 3]];
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const file = (name, index) => `${name.toLowerCase()}-${index + 1}.jpg`;
const fixture = (name, count) => ({
  id: `demo-${name.toLowerCase()}`, name: `DEMO — ${name}`,
  subtitle: 'Fotografia de demonstração para teste local',
  image: `/img/demo-galerias/${file(name, 0)}`,
  gallery: Array.from({length: count}, (_, i) => `/img/demo-galerias/${file(name, i)}`)
});
async function generateImages() {
  fs.mkdirSync(directory, {recursive: true});
  for (const [name, count] of names) for (let i = 0; i < count; i++) {
    const output = path.join(directory, file(name, i));
    if (fs.existsSync(output)) continue;
    const hue = name === 'Gastronomia' ? 24 : name === 'Produtos' ? 210 : 305;
    const angle = i * 31;
    const svg = `<svg width="800" height="1000" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="b" x2="1" y2="1"><stop stop-color="hsl(${hue + angle},45%,28%)"/><stop offset="1" stop-color="hsl(${hue + angle + 35},55%,58%)"/></linearGradient><radialGradient id="p"><stop stop-color="#fff9e9"/><stop offset=".8" stop-color="#d4b78c"/><stop offset="1" stop-color="#6f5748"/></radialGradient><filter id="s"><feGaussianBlur stdDeviation="25"/></filter></defs><rect width="800" height="1000" fill="url(#b)"/><ellipse cx="410" cy="610" rx="315" ry="235" fill="#17110d" opacity=".5" filter="url(#s)"/><g transform="rotate(${angle - 50} 400 500)"><ellipse cx="400" cy="490" rx="290" ry="215" fill="url(#p)"/><ellipse cx="400" cy="490" rx="245" ry="170" fill="#eee4d4"/><circle cx="${300 + i * 23}" cy="${460 + i * 9}" r="68" fill="hsl(${hue + 75 + angle},55%,42%)"/><circle cx="${480 - i * 15}" cy="${510 - i * 6}" r="55" fill="hsl(${hue + 12 + angle},68%,55%)"/><path d="M260 590 Q400 340 560 565" stroke="hsl(${hue + 115},47%,37%)" stroke-width="30" fill="none" opacity=".7"/></g><rect x="30" y="855" width="740" height="105" rx="8" fill="#161616" opacity=".8"/><text x="55" y="902" font-family="Arial" font-size="32" fill="#fff">DEMO · ${esc(name)}</text><text x="55" y="935" font-family="Arial" font-size="20" fill="#ddd">Imagem sintética ${i + 1} / ${count}</text></svg>`;
    await sharp(Buffer.from(svg)).jpeg({quality: 82}).toFile(output);
  }
}
async function serve() {
  process.env.DATABASE_URL = '';
  process.env.ALLOW_MEMORY_DB = '1';
  process.env.NODE_ENV = 'development';
  process.env.PORT = '3199';
  process.env.ADMIN_PIN = '2468';
  process.env.SESSION_SECRET = 'demo-only-portfolio-isolado-0123456789-abcdefghijklmnopqrstuvwxyz';
  process.env.ENABLE_CLIENT_GALLERIES = 'false';
  await generateImages();
  const {query} = require('../lib/db');
  const original = (await query('SELECT value, version, updated_at FROM content WHERE key = $1', ['siteData'])).rows[0]?.value || {};
  await query('INSERT INTO content (key, value, version, updated_at) VALUES ($1, $2::jsonb, 1, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, version = content.version + 1, updated_at = now() RETURNING version, updated_at', ['siteData', JSON.stringify({...original, categories: names.map(([n,c])=>fixture(n,c))})]);
  require('../main');
  console.log('DEMO isolada em http://127.0.0.1:3199 (PIN 2468). Nenhum Postgres/R2 usado.');
}
async function check() {
  const assert = require('node:assert/strict');
  const request = async (url, options={}) => fetch(base+url, options);
  const login = await request('/api/auth/login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:'2468'})});
  assert.equal(login.status, 200, 'login demo');
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const headers = {'Content-Type':'application/json', Cookie:cookie};
  const read = async () => (await (await request('/api/content?key=siteData')).json()).value;
  const publish = async categories => {
    const previous = await read();
    const result = await request('/api/content', {method:'PUT',headers,body:JSON.stringify({key:'siteData',value:{...previous,categories,version:(previous.version||0)+1,lastUpdated:Date.now()}})});
    assert.equal(result.status, 200, `publicação: ${await result.text()}`);
  };
  const visibleCount = html => (html.match(/class="cardapio-content"/g) || []).length;
  const dom = expected => {
    let html='';
    for(let attempt=0;attempt<3;attempt++){
      const profile = fs.mkdtempSync(path.join(require('node:os').tmpdir(),'vilma-demo-chrome-'));
      try {
        const result=spawnSync(chrome,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,'--virtual-time-budget=7000','--dump-dom',base+'/'],{encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});
        assert.equal(result.status,0,result.stderr?.slice(-500));
        html=result.stdout;
        if(html.includes('id="hero-pinterest-grid"') && visibleCount(html)===expected) return html;
      } finally {fs.rmSync(profile,{recursive:true,force:true});}
    }
    return html;
  };
  for (const [label,categories] of [
    ['uma com 8', [fixture('Gastronomia',8)]],
    ['duas com 8 e 5', [fixture('Gastronomia',8),fixture('Produtos',5)]],
    ['três com 8, 5 e 3', names.map(([n,c])=>fixture(n,c))],
    ['uma com 1', [fixture('Gastronomia',1)]],
    ['nenhuma', []]
  ]) {
    await publish(categories);
    const before=JSON.stringify((await read()).categories);
    const html=dom(categories.length);
    assert.ok(html.includes('id="hero-pinterest-grid"'),`${label}: página não carregou`);
    const count=visibleCount(html);
    const mural=[...html.matchAll(/class="pinterest-card[^\"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]*demo-galerias[^"]*)"/g)].map(m=>m[1]);
    assert.equal(count,categories.length,`${label}: quantidade de galerias`);
    assert.equal(new Set(mural).size,mural.length,`${label}: fotos repetidas no mural`);
    assert.equal(JSON.stringify((await read()).categories),before,`${label}: dados alterados pela renderização`);
    if (categories.length) assert.ok(mural.length > 0,`${label}: mural vazio`);
    console.log(`PASSOU ${label}: ${count} galerias, ${mural.length} fotos distintas no mural`);
  }
  const all=names.map(([n,c])=>fixture(n,c));
  await publish(all);
  const created=fixture('Gastronomia',1);created.id='demo-publicacao-extra';created.name='DEMO — Nova galeria';
  await publish([...all,created]);
  assert.equal((await read()).categories.length,4);
  await publish([...all,created]);
  assert.equal((await read()).categories.length,4,'publicação repetida duplicou galeria');
  created.subtitle='Edição de teste';
  await publish([...all,created]);
  assert.equal((await read()).categories.find(c=>c.id===created.id).subtitle,'Edição de teste');
  assert.equal(visibleCount(dom(4)),4,'refresh duplicou galeria');
  await publish(all);
  assert.equal((await read()).categories.length,3,'exclusão falhou');
  console.log('PASSOU criação, publicação repetida, edição, refresh e exclusão');
  for(const route of ['/login.html','/catalogo.html/demo','/pages/selecao.html','/api/galeria']) assert.equal((await request(route)).status,404,route);
  assert.equal((await request('/api/selecao',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,404,'envio privado');
  assert.equal((await request('/api/selecao')).status,401,'leitura administrativa sem sessão');
  assert.equal((await request('/api/selecao',{headers:{Cookie:cookie}})).status,200,'leitura administrativa autenticada');
  const publicHtml=await (await request('/')).text();
  assert.doesNotMatch(publicHtml,/Acessar minha galeria|banner-galeria-cliente/);
  assert.equal((await request('/api/galerias')).status,401,'API admin deve exigir login');
  console.log('PASSOU Área do Cliente bloqueada e links removidos');
  console.log('Cenário final: três galerias DEMO em '+base);
}
if(process.argv.includes('--serve')) serve().catch(e=>{console.error(e);process.exit(1)});
else check().catch(e=>{console.error(e);process.exit(1)});
