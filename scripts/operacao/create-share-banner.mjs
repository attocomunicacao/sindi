// Gera o banner de compartilhamento (WhatsApp, redes sociais) no layout atual do site: fundo e paleta do tema claro, a marca da SINDI (balão com as
// quatro figuras do logotipo), o título como na página inicial e uma prévia do chat com perguntas reais das sugestões.
// Uso: node scripts/operacao/create-share-banner.mjs   →   public/social/sindi-share-v2.jpg (1200×630) e os ícones do site em src/app
// (icon.svg para navegadores atuais, icon.png 192×192 e apple-icon.png 180×180 para a tela inicial do celular; o Next os publica sozinho).
// O nome do arquivo muda a cada versão: o WhatsApp guarda a prévia de cada endereço de imagem e não buscaria a nova com o mesmo nome.
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

// Paleta de src/app/globals.css (tema claro).
const C = { canvas: '#faf8f5', surface: '#ffffff', ink: '#2d2727', inkDeep: '#1e1a1a', muted: '#685f59', soft: '#8f8780', line: '#e6e0d8', gold: '#ebb92e', red: '#b61323' };
const FONTE = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

// Figuras do logotipo do SINDEPRESTEM, a mesma geometria de src/components/sindi-mark.tsx (caixa de 80×32 dentro do balão de 112×80).
const LOGO = [
  { cor: C.ink, cabeca: [125.3, 96.6], corpo: 'M71 226V481H15V581H173V400L358 585H532L173 226Z' },
  { cor: C.red, cabeca: [480.8, 96.6], corpo: 'M435 233V486L533 585V401L720 587H887L533 233Z' },
  { cor: C.gold, cabeca: [836.3, 96.6], corpo: 'M791 237V489L890 587V404L1077 591H1244L891 237Z' },
  { cor: 'none', cabeca: [1191.8, 96.6], corpo: 'M1139 232V486L1243 590V403L1427 588H1553V489H1497L1243 232Z' },
];
const ESCALA = 80 / 1538; const DESLOCA_Y = (32 - 591 * ESCALA) / 2;
const figuras = LOGO.map(({ cor, cabeca, corpo }) => {
  const vazada = cor === 'none';
  return `<g transform="translate(0 ${DESLOCA_Y}) scale(${ESCALA}) translate(-15 0)" fill="${cor}" stroke="${vazada ? C.ink : cor}" stroke-width="${vazada ? 22 : 2}" stroke-linejoin="round">
    <circle cx="${cabeca[0]}" cy="${cabeca[1]}" r="${vazada ? 96.6 - 11 : 96.6}"/><path d="${corpo}"/></g>`;
}).join('');
const marca = (x, y, escala) => `<g transform="translate(${x} ${y}) scale(${escala})">
  <path d="M11 4H101A7 7 0 0 1 108 11V53A7 7 0 0 1 101 60H38L22 74V60H11A7 7 0 0 1 4 53V11A7 7 0 0 1 11 4Z" fill="${C.surface}" stroke="${C.ink}" stroke-width="2.5" stroke-linejoin="round"/>
  <g transform="translate(16 16)">${figuras}</g></g>`;

// Prévia do chat: as mesmas três linhas de sugestão da página inicial e a caixa de mensagem.
const sugestoes = ['O que é trabalho temporário?', 'Qual o piso da portaria?', 'Como falar com o Setor Jurídico?'];
const cx = 676; const cy = 150; const cw = 464;
const linhas = sugestoes.map((s, i) => {
  const y = cy + 92 + i * 64;
  return `<line x1="${cx + 32}" y1="${y - 38}" x2="${cx + cw - 32}" y2="${y - 38}" stroke="${C.line}" stroke-width="2"/>
  <text x="${cx + 32}" y="${y}" font-family="${FONTE}" font-size="22" fill="${C.ink}">${s}</text>
  <path d="M${cx + cw - 50} ${y - 2}L${cx + cw - 38} ${y - 14}M${cx + cw - 47} ${y - 14}H${cx + cw - 38}V${y - 5}" stroke="${C.soft}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
}).join('');

const arte = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="${C.canvas}"/>
${marca(60, 52, 1.15)}
<rect x="64" y="210" width="56" height="7" rx="3.5" fill="${C.gold}"/>
<text x="58" y="330" font-family="${FONTE}" font-size="132" font-weight="700" letter-spacing="-4" fill="${C.ink}">SINDI</text>
<text x="64" y="388" font-family="${FONTE}" font-size="32" fill="${C.muted}">Assistente virtual do SINDEPRESTEM.</text>
<text x="64" y="446" font-family="${FONTE}" font-size="25" fill="${C.ink}">Terceirização e trabalho temporário:</text>
<text x="64" y="482" font-family="${FONTE}" font-size="25" fill="${C.ink}">leis, convenções, indicadores e orçamento.</text>
<rect x="64" y="532" width="136" height="38" rx="19" fill="${C.ink}"/>
<text x="132" y="557" text-anchor="middle" font-family="${FONTE}" font-size="15" font-weight="700" letter-spacing="1.5" fill="#ffffff">PROTÓTIPO</text>
<text x="222" y="558" font-family="${FONTE}" font-size="21" fill="${C.muted}">sindi-prototipo.vercel.app</text>
<rect x="${cx}" y="${cy - 40}" width="${cw}" height="380" rx="22" fill="${C.surface}" stroke="${C.line}" stroke-width="2"/>
<text x="${cx + 32}" y="${cy + 6}" font-family="${FONTE}" font-size="17" font-weight="600" letter-spacing="1.5" fill="${C.soft}">PERGUNTE À SINDI</text>
${linhas}
<line x1="${cx + 32}" y1="${cy + 246}" x2="${cx + cw - 32}" y2="${cy + 246}" stroke="${C.line}" stroke-width="2"/>
<rect x="${cx + 32}" y="${cy + 272}" width="${cw - 64}" height="52" rx="14" fill="${C.canvas}" stroke="${C.line}" stroke-width="2"/>
<text x="${cx + 52}" y="${cy + 305}" font-family="${FONTE}" font-size="20" fill="${C.soft}">Pergunte à SINDI</text>
<rect x="${cx + cw - 80}" y="${cy + 280}" width="36" height="36" rx="10" fill="${C.ink}"/>
<path d="M${cx + cw - 62} ${cy + 307}V${cy + 290}M${cx + cw - 69} ${cy + 297}L${cx + cw - 62} ${cy + 290}L${cx + cw - 55} ${cy + 297}" stroke="#ffffff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<rect y="618" width="1200" height="12" fill="${C.ink}"/><rect x="900" y="618" width="150" height="12" fill="${C.red}"/><rect x="1050" y="618" width="150" height="12" fill="${C.gold}"/>
</svg>`;

await mkdir('public/social', { recursive: true });
await sharp(Buffer.from(arte)).jpeg({ quality: 92, mozjpeg: true }).toFile('public/social/sindi-share-v2.jpg');
console.log('Banner 1200×630 criado em public/social/sindi-share-v2.jpg');

// Favicon: a mesma marca do cabeçalho, num quadrado. O balão é branco com contorno grafite, legível nas abas claras e escuras.
const icone = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -12 112 104">${marca(0, 0, 1)}</svg>`;
await writeFile('src/app/icon.svg', icone, 'utf8');
const quadrado = (lado, fundo) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="-10 -22 132 132"><rect x="-10" y="-22" width="132" height="132" fill="${fundo}"/>${marca(0, 0, 1)}</svg>`)).png();
await quadrado(192, C.canvas).toFile('src/app/icon.png');
await quadrado(180, C.canvas).toFile('src/app/apple-icon.png');
console.log('Ícones criados em src/app (icon.svg, icon.png, apple-icon.png)');
