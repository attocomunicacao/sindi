// Ambiente de navegador (jsdom) para os testes de interface. Importe este arquivo PRIMEIRO em cada teste .tsx: os globais precisam existir antes de o React e o Testing Library carregarem.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
const alvo = globalThis as unknown as Record<string, unknown>;
const janela = dom.window as unknown as Record<string, unknown>;
// `navigator` e outros são somente leitura no Node: defineProperty contorna.
for (const chave of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLButtonElement', 'HTMLAnchorElement', 'HTMLFormElement', 'Element', 'Node', 'NodeFilter',
  'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'InputEvent', 'FocusEvent', 'MutationObserver', 'DocumentFragment', 'Text', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'sessionStorage']) {
  Object.defineProperty(globalThis, chave, { value: chave === 'window' ? dom.window : janela[chave], configurable: true, writable: true });
}
alvo.IS_REACT_ACT_ENVIRONMENT = true;
// O jsdom não implementa estas APIs do navegador; os testes que precisarem trocam os stubs.
(dom.window as unknown as { scrollTo: () => void }).scrollTo = () => {};
(dom.window.HTMLElement.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
(URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:teste';
(URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
dom.window.HTMLAnchorElement.prototype.click = function click() { /* sem navegação no jsdom */ };

export { dom };
/** Troca o valor de `document.hidden` (aba oculta ou visível) e avisa a página, como o navegador faz. */
export function definirAbaOculta(oculta: boolean) {
  Object.defineProperty(dom.window.document, 'hidden', { configurable: true, get: () => oculta });
  dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));
}
