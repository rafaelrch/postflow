/**
 * Canal de suporte do produto — FONTE ÚNICA.
 *
 * Decisão do Rafael (02/09/2026): o suporte é por WhatsApp, não por e-mail.
 *
 * Antes desta lib o contato estava copiado e colado em 5 páginas públicas, e a
 * duplicação cobrou o preço dela: o endereço espalhado (`contato@creatools.com`)
 * nem era o domínio que envia os e-mails do produto — o Resend manda de
 * `creatools.com.br`. Ninguém notou, porque não havia um lugar para notar.
 * Agora há: mudou aqui, mudou em todo lugar.
 *
 * ⚠️ O NÚMERO ABAIXO É PLACEHOLDER. O Rafael vai mandar o número real; quando
 * mandar, troque SÓ a constante `SUPORTE_WHATSAPP_DIGITOS` (e o rótulo). Nada
 * mais precisa ser tocado: o link e o texto exibido saem daqui.
 */

/**
 * Só dígitos, com DDI — é o formato que o wa.me exige (nada de +, espaço,
 * parêntese ou hífen). 55 = Brasil, 71 = DDD, o resto é o número.
 */
export const SUPORTE_WHATSAPP_DIGITOS = '5571900000000';

/** O número como a pessoa lê na tela. */
export const SUPORTE_WHATSAPP_LABEL = '(71) 90000-0000';

/**
 * O link que abre a conversa. O wa.me é o encurtador oficial do WhatsApp e
 * funciona tanto no app quanto no WhatsApp Web, então serve para quem abre no
 * celular e para quem abre no computador.
 *
 * É link EXTERNO: quem usar deve abrir em nova aba, com
 * `rel="noopener noreferrer"`.
 */
export const SUPORTE_WHATSAPP_URL = `https://wa.me/${SUPORTE_WHATSAPP_DIGITOS}`;
