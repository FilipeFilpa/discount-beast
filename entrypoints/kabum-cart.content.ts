import { mountCartPanel } from '@/lib/cart-panel';
import { isKabumCouponPage, kabumCart, rememberKabumItems } from '@/lib/carts/kabum';

/**
 * Na KaBuM!, o campo de cupom aparece a partir da etapa "Endereço" (/endereco).
 * No /carrinho só guardamos os nomes dos produtos, para escolher os cupons que combinam.
 */
export default defineContentScript({
  matches: ['https://kabum.com.br/*', 'https://*.kabum.com.br/*'],
  runAt: 'document_idle',
  main() {
    setInterval(rememberKabumItems, 2000);
    mountCartPanel({ store: 'kabum', storeName: 'KaBuM!', cart: kabumCart, isCart: isKabumCouponPage });
  },
});
