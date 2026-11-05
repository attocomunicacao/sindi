import { readFileSync } from 'node:fs';
import { load } from 'cheerio';
const $ = load(readFileSync('.data/site-home.txt', 'utf8'));
console.log('main', $('main').length, $('main').text().slice(0, 600));
console.log([...new Set($('a[href]').map((_, e) => $(e).attr('href')).get())]);
for (const name of ['pages-sitemap.xml','blog-posts-sitemap.xml','blog-categories-sitemap.xml']) {
 const r = await fetch(`https://www.sindeprestem.com.br/${name}`); const xml = load(await r.text(), { xml: true });
 console.log(name, xml('loc').length, xml('loc').map((_, e) => xml(e).text()).get().slice(0, 6));
}
