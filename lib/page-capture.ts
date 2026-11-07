/**
 * "Salvar carrinho para o Discount Beast": baixa uma cópia limpa do HTML da página.
 * Serve para descobrir os seletores de uma loja nova sem pedir prints do DevTools.
 * Tiramos scripts, estilos, imagens, blocos de endereço, CEPs/CPFs e valores de campos, para o arquivo ficar pequeno
 * e não levar nada sensível (só sobra a estrutura e os textos visíveis).
 */
const DROP = '[class*="address" i], [data-testid*="address" i], [class*="endereco" i], [class*="customer" i], [id*="address" i], [id*="endereco" i], [class*="shipping-address" i], [data-testid*="customer" i], script, style, noscript, iframe, svg, img, picture, video, link, meta, template, discount-beast-panel, discount-beast-capture';

export function cleanPageHtml(doc: Document = document): string {
  const clone = doc.documentElement.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(DROP).forEach((el) => el.remove());
  for (const el of clone.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      // Campos de formulário (CEP, e-mail...) e atributos enormes (style, srcset, eventos) não servem para achar seletores.
      if (name === 'value' && el.tagName === 'INPUT' && !/^(submit|button)$/i.test(el.getAttribute('type') ?? '')) el.removeAttribute(attr.name);
      else if (name === 'style' || name.startsWith('on') || name === 'srcset' || name === 'd') el.removeAttribute(attr.name);
    }
  }
  // Quais campos estavam visíveis e o que estava digitado no campo de cupom (só ele).
  const visibleInputs = [...doc.querySelectorAll<HTMLInputElement>('input')]
    .filter((i) => i.getBoundingClientRect().width > 0)
    .map((i) => ({ id: i.id, name: i.name, type: i.type, placeholder: i.placeholder, ...(/cupo|coupon|promo|voucher/i.test(`${i.id} ${i.name} ${i.placeholder}`) ? { value: i.value } : {}) }));
  const header = `<!-- discount-beast capture\nurl: ${location.href}\nat: ${new Date().toISOString()}\nvisibleInputs: ${JSON.stringify(visibleInputs).replaceAll('--', '- -')}\n-->\n`;
  // Endereços e nome no meio do texto: some com CEPs, CPFs, e-mails e telefones que sobrarem.
  const html = clone.outerHTML.replace(/\b\d{5}-?\d{3}\b/g, '[CEP]').replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]').replace(/\(?\b\d{2}\)?\s?9?\d{4}-?\d{4}\b/g, '[TEL]');
  return header + html;
}

export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/html;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
