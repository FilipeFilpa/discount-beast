/**
 * "Salvar carrinho para o Discount Beast": baixa uma cópia limpa do HTML da página.
 * Serve para descobrir os seletores de uma loja nova sem pedir prints do DevTools.
 * Tiramos scripts, estilos, imagens e valores de campos, para o arquivo ficar pequeno
 * e não levar nada sensível (só sobra a estrutura e os textos visíveis).
 */
const DROP = 'script, style, noscript, iframe, svg, img, picture, video, link, meta, template, discount-beast-panel, discount-beast-capture';

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
  return header + clone.outerHTML;
}

export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/html;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
