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
 * O número real entrou em 02/09/2026 (o Rafael mandou), no lugar do placeholder
 * com que esta lib nasceu.
 */

/**
 * Só dígitos, com DDI. 55 = Brasil, 71 = DDD, o resto é o número.
 *
 * Desde 03/09/2026 o LINK não é mais montado a partir daqui (ver
 * `SUPORTE_WHATSAPP_URL`) — mas os dígitos continuam sendo a fonte do RÓTULO,
 * que é derivado deles e não escrito à mão. É o mesmo número dos dois lados.
 */
export const SUPORTE_WHATSAPP_DIGITOS = '5571992230643';

/** O número como a pessoa lê na tela. */
export const SUPORTE_WHATSAPP_LABEL = '(71) 99223-0643';

/**
 * O link que abre a conversa — ENDEREÇO CANÔNICO do canal, um só.
 *
 * Ordem do Rafael (03/09/2026): o suporte do rodapé passa a apontar para
 * `https://wa.link/eftqk2`. É o MESMO canal de sempre, na forma de link curto
 * oficial do WhatsApp — o wa.link é o gerador da própria Meta, e a vantagem
 * sobre o formato antigo (o encurtador montado com os dígitos) é que ele pode
 * carregar mensagem pré-preenchida e ser trocado do lado deles sem tocar no
 * código.
 *
 * Por que ele é a URL de TODOS os pontos, e não só do rodapé: dois endereços
 * para o mesmo canal é a duplicação que esta lib veio acabar. Se o rodapé
 * abrisse um e as páginas jurídicas outro, um dia um dos dois envelheceria
 * sozinho e ninguém teria onde notar.
 *
 * 🔴 NÃO é derivado de `SUPORTE_WHATSAPP_DIGITOS`: o slug `eftqk2` é gerado
 * pelo WhatsApp e não tem relação calculável com o número. Os dígitos seguem
 * mandando no RÓTULO, que é o que a pessoa lê na tela.
 *
 * É link EXTERNO: quem usar deve abrir em nova aba, com
 * `rel="noopener noreferrer"`.
 */
export const SUPORTE_WHATSAPP_URL = 'https://wa.link/eftqk2';
