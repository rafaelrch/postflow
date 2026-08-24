import type { ImageShape, ImageSurface } from '@/types';
import type { BrandContext } from '@/lib/brand-context';

/**
 * O PROMPT DE IMAGEM, EM CAMADAS.
 *
 * Antes isto era UMA string concatenada com um sufixo fixo colado no fim, e o
 * sufixo brigava com o resto do prompt. Dois defeitos provados na fonte:
 *
 * 1. 🔴 CONTRADIÇÃO DE ORIENTAÇÃO. O sufixo fixo terminava em
 *    "vertical composition" e era colado em TODO prompt — inclusive no
 *    `inset-landscape`, cujo enquadramento pede "wide horizontal composition".
 *    O prompt entregue dizia as duas coisas na mesma frase e o modelo resolvia
 *    como quisesse. Agora a orientação sai de UM lugar só: a camada de
 *    COMPOSITION, derivada do `shape`. Não existe mais orientação no texto fixo.
 *
 * 2. 🔴 ATMOSFERA IMPOSTA. "dark atmosphere" também era fixo, para os quatro
 *    templates. Mas o Radar é creme (#EEE5D9), o Perfil é um card BRANCO
 *    (#FFFFFF) e o Manifesto alterna modelos claros (#FFFFFF) e escuros
 *    (#050416). Pedir foto escura para um slide claro entrega uma imagem que
 *    briga com o slide em que ela cai. Agora a atmosfera vem do `surface` do
 *    destino.
 *
 * Este módulo é PURO de propósito — nenhum import do client da OpenAI. Assim o
 * prompt inteiro pode ser afirmado em teste de node, sem chave de API e sem
 * gastar crédito do usuário, que é o que torna a melhoria mensurável em vez de
 * "aumentamos o prompt e parece melhor".
 *
 * REGRA DE OURO deste arquivo: mesma entrada, mesma string. Nada de data,
 * random, ordem de chave de objeto ou qualquer coisa que mude entre duas
 * chamadas iguais — o teste de determinismo existe para travar isso.
 */

/** Rótulo de cada camada, na ordem em que entram no prompt final. */
const LAYERS = ['ROLE', 'SUBJECT', 'ART DIRECTION', 'COMPOSITION', 'EXCLUDE', 'OUTPUT'] as const;
type Layer = (typeof LAYERS)[number];

/**
 * Camada de SISTEMA. Diz o que a imagem É antes de dizer o que ela mostra.
 *
 * O ROLE antigo ("editorial photography art director") pedia uma FOTO BOA do
 * assunto — e era exatamente isso que voltava: um homem treinando para uma copy
 * que falava de treinar muito e evoluir pouco. Foto correta, ideia perdida.
 * O papel agora é de DIRETOR DE CONCEITO: quem traduz ideia editorial em
 * metáfora fotográfica antes de pensar em lente.
 *
 * `high-end photographic VFX artist` está aqui de propósito e com coleira: o
 * efeito é ferramenta do conceito, nunca o ponto de partida — a camada SUBJECT
 * fecha essa porta com METAPHOR FIRST, EFFECTS SECOND.
 *
 * 🔴 NÃO fala de compositing. A variante de compositing só faz sentido quando
 * existe foto de referência humana, e o builder ainda não sabe que referência
 * existe (a rota decide `images.edit` sem contar ao prompt) — é a fatia 3.
 */
const ROLE =
  'You are a senior visual concept director, cinematic photographer and high-end photographic VFX artist creating one high-impact image for a social media carousel. Translate editorial ideas into original, immediately understandable photographic metaphors. The result should feel like an ambitious real-world creative production photographed on location and, only when conceptually useful, enhanced with sophisticated, physically believable visual effects. Visual language: CINEMATIC CONCEPTUAL REALISM.';

/**
 * O MESMO ROLE, mais o ofício que uma foto de referência exige.
 *
 * Entra quando existe referência — e SÓ então. Um prompt sem imagem de entrada
 * nenhuma que diz "você é um artista de compositing" empurra o modelo a
 * procurar algo para compor, e a fabricar um sujeito que não foi pedido.
 *
 * 🔴 Fala em "reference subject", não em "pessoa". O painel aceita produto,
 * cenário ou pessoa, e o prompt não tem como saber qual dos três chegou — quem
 * está olhando a foto é o modelo. Compor um tênis numa cena também é
 * compositing; quem decide se há gente ali é a condicional do SUBJECT.
 */
const ROLE_REFERENCE =
  'You are a senior visual concept director, cinematic photographer, high-end photographic VFX artist and senior photographic compositing artist creating one high-impact image for a social media carousel. Translate editorial ideas into original, immediately understandable photographic metaphors, and integrate the supplied reference subject into that scene as if it had genuinely been photographed there. The result should feel like an ambitious real-world creative production photographed on location and, only when conceptually useful, enhanced with sophisticated, physically believable visual effects. Visual language: CINEMATIC CONCEPTUAL REALISM.'

/**
 * ATMOSFERA por claridade do destino.
 *
 * O que manda aqui é a superfície em que a imagem CAI, não o gosto de quem
 * escreveu o prompt: uma foto escura num card branco (Perfil) ou num slide
 * creme (Radar) faz o slide brigar consigo mesmo.
 *
 * `dark` é o padrão em toda a cadeia — é literalmente o comportamento de hoje,
 * então quem não informar `surface` recebe a mesma atmosfera de antes.
 *
 * 🔴 O QUE MUDOU NO DARK. A frase antiga dizia "deep shadows" E "keep the value
 * range low" E "let the darkest areas fall to near-black" — três empurrões para
 * o mesmo lado e nada puxando de volta. Na validação visual isso virou problema
 * REAL: imagem escura demais, quadro inteiro afundado, cena ilegível.
 *
 * O conserto NÃO é clarear. Preto continua permitido e a atmosfera continua
 * low-key: o que entra é luz SELETIVA, separação dimensional em volta do ponto
 * focal e a exigência de que o ambiente continue legível. Escuro por escolha,
 * não escuro por atacado. O `light` não foi tocado.
 */
const ATMOSPHERE: Record<ImageSurface, string> = {
  dark:
    'Low-key, moody atmosphere with rich shadows, controlled highlights and selective lighting; the image sits on a DARK slide, so keep the overall value range low. Shape the light so the focal point gains dimensional separation from its surroundings and the surrounding environment stays readable. Dark areas may fall close to black where that is photographically appropriate, but never let the frame read as uniformly dark or as muddy underexposure.',
  light:
    'High-key, bright and airy atmosphere with soft diffused light and open shadows; the image sits on a LIGHT slide, so keep the overall value range high and avoid heavy blacks that would fight the pale surface.',
};

/**
 * COMPOSIÇÃO por formato do destino — e o ÚNICO lugar que fala de orientação.
 *
 * Cada entrada diz três coisas na ordem: a orientação, o que sobrevive ao
 * corte daquela caixa, e como se comporta a região em que o texto do slide
 * entra por cima. Essa região não é detalhe: o texto é desenhado sobre a
 * imagem depois, e uma foto cheia de detalhe no lugar errado torna o slide
 * ilegível sem que a imagem em si pareça ruim.
 *
 * 🔴 O QUE MUDOU NA FATIA 1 — e é a correção mais concreta desta task. O
 * full-bleed dizia `Leave a calm, low-detail, low-contrast area across the
 * lower half`. O verbo era o defeito: `leave an area` o modelo lê como PAINEL
 * LISO, e metade do quadro voltava sem cena nenhuma. A foto chegava ao slide já
 * pela metade, e o que devia ser respiro virava buraco.
 *
 * A decisão de fundo continua de pé: a região da tipografia TEM de ser mais
 * calma, porque o texto vai por cima. O que mudou é o significado de calma —
 * agora é MENOS INTERFERÊNCIA (menos detalhe, menos contraste), nunca ausência
 * de cena. A região continua obrigada a ter ambiente, textura, luz, atmosfera e
 * profundidade, e o quadro inteiro é preenchido de propósito.
 *
 * `inset-block` e `inset-landscape` não mudam: neles o texto não vai por cima
 * da imagem, então nunca tiveram região calma nenhuma para corrigir.
 */
const COMPOSITION: Record<ImageShape, string> = {
  'full-bleed':
    'Vertical portrait orientation. Full-bleed background composition that survives being cropped at the edges: keep the subject away from the borders. Fill the entire photographic frame intentionally, edge to edge. Typography will later be laid over the photograph across the lower half, so let that region resolve into a naturally calmer passage with lower detail, softer contrast and less visual interference — it must still contain believable environment, texture, light, atmosphere and depth. Never construct an artificial flat panel, an unpopulated half of the frame or a visually vacant corner to host typography.',
  'inset-block':
    'Vertical portrait orientation. Single centered subject in a tight composition that still reads when cropped to a narrow portrait strip: keep everything essential in the central column, nothing important near the left or right edges. No text is laid over this image, so it may fill the frame.',
  'inset-landscape':
    'Wide horizontal landscape orientation. Single centered subject that survives being cropped at the top and bottom: keep everything essential in the middle band, with generous headroom and floor that can be trimmed away, and nothing important near the upper or lower edges. No text is laid over this image, so it may fill the frame.',
};

/**
 * EXCLUSÕES. Ficam numa camada própria e nomeada porque é a parte que o modelo
 * mais atropela: qualquer menção a "editorial" puxa letreiro, marca d'água e
 * legenda inventada para dentro da foto — e aí a imagem entra no slide já
 * brigando com o texto de verdade que vai por cima.
 *
 * 🔴 EXISTE UM SÓ, E ELE É CONDICIONAL. Antes eram DOIS textos escolhidos por um
 * sinalizador que o usuário tinha de marcar na barra lateral. O sinalizador
 * saiu: o Rafael olhou a tela e disse que o usuário só tem que conseguir gerar.
 * E a condição nunca precisou morar no nosso código — quem sabe se a copy pede
 * uma marca é quem LÊ a copy, e o modelo já recebe a copy inteira na camada
 * SUBJECT. "explicitly requested by the source copy or user direction" é a
 * condicional, e ela se avalia sozinha do lado de lá.
 *
 * O que isso mata junto: a lista curada de nomes de marca que seria necessária
 * para detectar isso do nosso lado — heurística que erra nos dois sentidos, com
 * nome fora da lista não ativando e nome comum ativando errado.
 *
 * 🔴 ENCOLHEU. Este bloco chegou a 822 caracteres e ia em TODA imagem, mesmo
 * num carrossel sobre rotina matinal que não cita marca nenhuma — ruído puro no
 * caso comum. Foi cortado para o essencial: marca pedida pode, marca não pedida
 * não pode, não inventar lettering, e sem asset oficial preferir símbolo
 * coerente a pseudo-logo torto. O que NÃO encolheu foi a proibição de texto
 * aleatório, pelo motivo abaixo.
 *
 * 🔴 A LINHA QUE NÃO PODE SER CRUZADA: liberar MARCA não é liberar TEXTO.
 * O EXCLUDE proíbe letra dentro da imagem por um motivo mecânico — a tipografia
 * do template é desenhada POR CIMA da foto, e letra inventada pela IA briga com
 * o texto de verdade do slide. A exceção é para o ELEMENTO DE MARCA PEDIDO, e
 * para mais nada: letreiro, legenda, headline e UI falsa continuam proibidos, e
 * inventar texto de marca é proibido explicitamente.
 */
const EXCLUDE =
  'No random readable text, letters, words, captions, headlines, watermarks, signatures, UI elements or fake UI copy; no borders, frames, collage or split-screen; nothing that looks like a screenshot. Brands or products explicitly requested by the copy or user direction may appear where editorially relevant; unrequested logos and brands may not. Do not invent brand lettering, slogans or product copy. With no official asset, prefer a coherent symbolic identity over distorted pseudo-logos.';

/**
 * FORMATO DE SAÍDA: o acabamento fotográfico, sem uma palavra de orientação.
 *
 * 🔴 SAIU DAQUI: `shallow depth of field`. Era uma LENTE colada em todo pedido,
 * e boa parte das metáforas desta direção visual depende do ambiente estar
 * legível — o homem correndo dentro da roda só se lê se a roda estiver nítida.
 * Desfocar o fundo por regra apaga justamente o que a imagem precisa dizer. A
 * profundidade de campo passou a ser escolha de conceito, na ART DIRECTION.
 */
const OUTPUT =
  'A single believable professional photograph with cinematic conceptual realism and immediate visual impact. It should feel like a premium editorial or creative campaign photograph, with one clear focal point, strong visual hierarchy, realistic human anatomy, believable physical materials and minimal visible signs of AI generation. Extraordinary visual elements are allowed when conceptually necessary, but they must feel physically integrated into the photographed world. No illustration, no childish 3D, no videogame-render aesthetic, no generic stock-photo staging.';

/**
 * Intenção editorial do slide dentro do deck.
 *
 * A distinção capa / miolo / final já existia e continua — o que mudou é onde
 * ela mora. Antes o rótulo era um PREFIXO que emendava direto no assunto
 * ("Cover slide — a cinematic establishing shot that opens the carousel for:
 * <copy>"), e por isso a copy chegava ao modelo como DESCRIÇÃO DA CENA. Agora
 * o rótulo abre a camada e a direção de posição fecha, com a copy no meio
 * marcada como contexto semântico — a copy deixou de ser o objeto fotografado.
 */
const INTENT = {
  cover: {
    label: 'Cover slide',
    cue: 'This is the opening frame of the carousel: favour a visually immediate, strong establishing concept built around a feed-stopping focal point.',
  },
  final: {
    label: 'Closing slide',
    cue: 'This is the closing frame of the carousel: favour a restrained but memorable concluding visual gesture.',
  },
  middle: {
    label: 'Middle slide',
    cue: 'This is a supporting frame: favour one focused visual metaphor supporting one clear idea.',
  },
} as const;

/**
 * A EXIGENCIA DE CONCEITO — reescrita depois da PRIMEIRA EVIDENCIA EM PIXEL.
 *
 * O Rafael gerou de verdade e levou o resultado para analise. Duas falhas
 * concretas, e as duas eram de CONTEUDO, nao de arquitetura:
 *
 * 1. 🔴 METADE DA CONTRADICAO. Para "Voce pode estar treinando muito e
 *    evoluindo pouco" voltaram fotos de esforco e CANSACO — homem exausto
 *    sentado na academia. Bonitas, e erradas: a ideia e esforco + POUCO
 *    PROGRESSO, e a imagem mostrava so o lado do esforco. As mesmas fotos
 *    ilustrariam "Voce esta treinando demais?" ou "Como evitar overtraining".
 *    O texto antigo pedia "uma contradicao, transformacao ou tensao" — pedia o
 *    INGREDIENTE, nao a RELACAO — e o modelo escolhia um lado e parava.
 *    Agora a instrucao e nomear a relacao e fotografar A RELACAO: quando a
 *    ideia contrasta dois estados, os DOIS tem de estar legiveis no quadro.
 *
 * 2. 🔴 NOME PROPRIO LIDO PELO DICIONARIO. Para "Codex vs Claude Code" o modelo
 *    desenhou um CODICE — manuscrito antigo, ao lado de um programador. Leu o
 *    significado lexical do nome em vez da entidade que a copy trata. Dai a
 *    desambiguacao vir ANTES do conceito: entender de quem se fala e
 *    pre-requisito para decidir o que fotografar.
 *
 * 🔴 A CONCEPT VALIDATION RULE FOI SUBSTITUIDA, nao somada. A antiga ("poderia
 * ser confundida com uma foto generica sobre o tema") existia nas geracoes que
 * falharam e nao bastou — e vaga demais para o modelo aplicar em si mesmo. A
 * nova e operacional: se a MESMA imagem serviria para VARIAS headlines
 * genericas do tema, esta fraca. As fotos de academia passariam na regra velha
 * e reprovam na nova.
 *
 * 🔴 NADA AQUI E ESPECIFICO DE FITNESS. O exemplo entre parenteses fala de
 * "great effort AND unchanged result" — abstrato de proposito. A mesma regra
 * vale para dinheiro parado x rendendo, risco pequeno x consequencia enorme,
 * aparencia x realidade, velocidade x direcao. Existe teste varrendo o prompt
 * atras de academia, esteira e afins justamente para isso nao voltar.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 🔴 SEGUNDA RODADA DE EVIDENCIA — e ela mudou o ALVO do conserto.
 *
 * O refinamento acima ("nomeie a RELACAO e fotografe a relacao") NAO resolveu:
 * a mesma copy de fitness voltou com homem exausto no banco e homem exausto
 * ajoelhado. Mesmo defeito, outra pose.
 *
 * O que revelou a causa foi um TESTE DE CONTROLE: o Rafael digitou a cena na
 * mao no prompt livre — "homem correndo com muito esforco dentro de uma enorme
 * roda de metal, preso no mesmo lugar" — e o modelo entregou a imagem certa DE
 * PRIMEIRA. Ou seja: o gpt-image-2 DESENHA otimo. O que ele nao faz e o salto
 * de raciocinio de virar ideia abstrata em cena. Toda a instrucao anterior era
 * uma ORDEM DE RACIOCINIO, e por isso falhava — o modelo captava o CLIMA da
 * frase (cansaco) e desenhava o clima.
 *
 * O QUE FALTAVA, dito com precisao: "pouco progresso" NAO TEM APARENCIA.
 * Esforco tem (suor, peso, musculo). A ausencia de progresso so existe se
 * alguem inventar um OBJETO que a torne visivel. Faltava o REPERTORIO, nao mais
 * conceito.
 *
 * Por isso entrou o metodo concreto, e por FAMILIA e nunca por cena: "um
 * mecanismo que sempre volta ao inicio", nao "uma roda". Se a roda entrasse
 * aqui, todo carrossel de fitness sairia com roda — e existe teste varrendo o
 * prompt atras de gym, treadmill, hamster, wheel, money, vault e afins.
 *
 * 🔴 E O RECURSO CONCRETO DESFEZ UMA TENSAO QUE EU MESMO TINHA REGISTRADO como
 * risco na entrega passada: "both must be legible in the same frame" puxava
 * perigosamente para composicao de dois lados, brigando com a clausula
 * anti-simetria tres frases adiante. A roda carrega o esforco E a ausencia de
 * progresso NO MESMO OBJETO — nao em duas metades do quadro. Dai o texto dizer
 * "inside one object or situation, never in two halves of the image": ensina o
 * metodo e reforca o anti-versus na mesma frase, no lugar de duas instrucoes
 * que se puxavam.
 *
 * O QUE SAIU PARA PAGAR, tudo por ter virado redundante:
 * - cinco dos oito tipos de relacao (imbalance, expectation versus reality,
 *   progress versus stagnation, tension). Eram sinonimos de contraste, e o
 *   metodo concreto faz o trabalho que a enumeracao tentava fazer;
 * - "both must be legible in the same frame (great effort AND unchanged
 *   result...)" — dito melhor, e sem o efeito colateral, pelo recurso;
 * - "it is not enough to merely represent the topic" — a CONCEPT VALIDATION
 *   RULE ja diz isso de forma verificavel;
 * - "never a symmetrical two-sides composition" — substituida por "never in two
 *   halves of the image", que e mais concreta, esta sempre presente do mesmo
 *   jeito e portanto continua cobrindo o falso negativo da deteccao de
 *   rivalidade ("a guerra entre X e Y"). Ver `RIVALRY`.
 */
const CONCEPT =
  'Interpret the underlying IDEA visually: the image must carry it even if the viewer never reads the headline. First resolve entities through the editorial context of the copy: proper names, products, companies, technologies and public figures mean what the copy means, never the dictionary sense of the name (in software and AI copy, "Codex" is OpenAI Codex, not an ancient manuscript). Then name the RELATION that gives the idea its meaning — contradiction, cause versus result or transformation — and photograph the relation, not one side of it. One side of a relation often has no natural appearance: effort does, the lack of progress does not. Invent a concrete photographic device that makes the invisible side visible — a mechanism that always returns to its start, a marker left unchanged beside a repeated action, a measure that refuses to rise, two identical states separated by time, or a tiny cause with an enormous consequence — and let that device carry BOTH sides inside one object or situation, never in two halves of the image. CONCEPT VALIDATION RULE: if the same image could illustrate several different generic headlines about this topic, reject it and find a more specific metaphor. METAPHOR FIRST, EFFECTS SECOND: find the strongest metaphor, and add effects only if they materially strengthen it; never default to holograms, neon, floating particles, HUD overlays, teal-and-orange grading or cyberpunk styling.';

/**
 * REALISMO FOTOGRÁFICO. O que separa "foto" de "render de foto".
 *
 * Poro, fio de cabelo solto, grão de sensor e queda de luz não são capricho: são
 * os sinais pelos quais o olho decide, em meio segundo de feed, se aquilo foi
 * fotografado. A perfeição sintética é o que denuncia IA.
 *
 * 🔴 A profundidade de campo vive AQUI e é CONDICIONAL — antes era `shallow
 * depth of field` obrigatório no OUTPUT, o que desfocava justamente o ambiente
 * de que a metáfora depende.
 *
 * Compactado na rodada da evidência, sem perder regra: `natural depth-of-field
 * falloff` saiu da lista de imperfeições porque a frase seguinte já decide a
 * profundidade de campo inteira — a mesma instrução aparecia duas vezes em toda
 * imagem. E a lista de fontes de luz perdeu dois exemplos que não acrescentavam
 * caso novo. Nenhum adjetivo novo entrou aqui.
 */
const REALISM =
  'Photographic realism is mandatory: real human anatomy, natural facial proportions, authentic skin texture with visible pores and small imperfections, individual hair strands, believable clothing materials and real environmental textures. Light the scene with cinematic lighting motivated by actual sources in the frame, such as windows, lamps, monitors or practical fixtures. Allow the natural imperfections of real photography: subtle sensor grain, minor lens softness, realistic highlight rolloff, slight exposure variation, small imperfect reflections and restrained motion blur when physically appropriate. Choose the depth of field to serve the concept — shallow focus only when it strengthens the focal point, deeper focus when the surrounding scene carries the idea. Avoid hyper-clean synthetic perfection.';

/**
 * IMPACTO NO FEED. A imagem compete com o polegar antes de competir com o tema.
 *
 * O impacto é pedido por MECANISMO — perspectiva, escala, tensão, textura, luz,
 * posição de câmera — e nunca por adjetivo ("epic", "viral", "extreme"), que o
 * modelo traduz em exagero genérico igual para todo assunto.
 *
 * A última frase é o desempate: entre metáforas válidas, ganha a que se entende
 * de relance. Conceito que precisa de legenda não para scroll nenhum.
 */
/**
 * IDENTITY MODE — a direção de referência humana.
 *
 * IDENTITY LOCKED. BODY POSE UNLOCKED. FACE ANGLE CONSERVATIVE.
 *
 * A validação visual anterior achou DOIS erros opostos, e a frase acima é a
 * resposta aos dois de uma vez:
 *
 *   Erro A — preservar demais o ângulo da SELFIE: o rosto voltava frontal,
 *   "colado" num corpo inclinado. Parecia recorte, não fotografia.
 *   Erro B — liberar demais a pose: o corpo ficava natural e o rosto passava a
 *   ser apenas PARECIDO com a referência. A pessoa deixava de ser a pessoa.
 *
 * Daí a divisão: a referência define QUEM (identidade travada, lista de traços
 * explícita) e não define COMO (pose, olhar, expressão, luz, ambiente,
 * enquadramento — tudo liberado). O ângulo do rosto fica no meio, conservador
 * de propósito: como só existe UMA foto de referência, girar demais a cabeça
 * custa identidade, e identidade é a prioridade.
 *
 * A lista de traços é longa porque tem de ser: "preserve o rosto" é vago o
 * bastante para o modelo entregar um irmão da pessoa. Espaçamento dos olhos,
 * proporção dos lábios e assimetria natural são o que separa a pessoa de
 * alguém com a mesma descrição.
 *
 * 🔴 É CONDICIONAL, e é aí que está a mudança de rumo. Antes um campo
 * `referenceMode` decidia se este bloco entrava, e quem marcava era o usuário
 * num checkbox. O checkbox saiu. Agora o bloco entra SEMPRE que existe
 * referência, escrito como "If the supplied reference photograph shows a
 * person" — e quem avalia a condição é quem está OLHANDO a foto, porque a
 * imagem vai junto no `images.edit`. Se a referência for um tênis, a
 * condicional simplesmente não dispara.
 *
 * Repare que a condicional ABRE o bloco: as três declarações em caixa alta
 * ficam DENTRO dela, e não antes. "IDENTITY LOCKED" gritado sobre uma foto de
 * produto seria uma ordem sem objeto.
 */
const IDENTITY =
  'If the supplied reference photograph shows a person, then IDENTITY LOCKED, BODY POSE UNLOCKED, FACE ANGLE CONSERVATIVE: that person is the exact real person who must appear in the generated image, and identity fidelity is a top priority. Do not create someone who merely resembles the reference, do not beautify the subject and do not redesign facial features. Preserve the face shape, the face width-to-height relationship, forehead, hairline, eyebrows, eyes, eyelids, eye spacing, nose, nostrils, mouth, lip proportions, cheeks, jaw, chin, ears, facial hair, skin texture, small imperfections and natural asymmetry. The reference photograph defines WHO the person is; it does not define the original selfie angle, body pose, gaze, expression, camera perspective, lighting, environment or framing, all of which should serve the concept. Because only one reference exists, do not push the face into an extreme orientation if doing so would substantially reduce identity fidelity: prefer a natural near-frontal or three-quarter facial angle that keeps the person clearly recognizable while the body pose stays dynamic. Do not paste the original face as a flat frontal mask onto a rotated body — the head, neck, shoulders and body must remain anatomically coherent. The final result should look like the same real person was genuinely photographed in the generated scene. If the reference photograph shows an object, product or place instead, treat it as the real subject to integrate faithfully into the scene rather than as a person.';

/**
 * PUBLIC FIGURE MODE — quando a pessoa citada É o assunto editorial.
 *
 * Mora no SUBJECT, e não na COMPOSITION, mesmo carregando uma direção de
 * encenação: a pergunta que ele responde é QUEM aparece na imagem, e a
 * encenação aqui é consequência disso, não do formato do destino. Pôr isto na
 * COMPOSITION misturaria a única camada que fala de orientação com uma regra
 * que nada tem a ver com o `shape`.
 *
 * 🔴 ENTRA SEMPRE, e não por sinalizador. O texto já nasceu condicional no
 * material — "When real public figures are explicitly part of the editorial
 * subject" — e quem sabe se a copy cita Sam Altman é quem lê a copy, que chega
 * inteira algumas frases acima nesta mesma camada. O sinalizador que existia
 * aqui só transferia para o usuário uma pergunta que o modelo já responde, e
 * cobrava um clique por ela.
 *
 * 🔴 A REGRA ANTI-VERSUS SAIU DAQUI, e essa é a correção mais óbvia desta
 * rodada. Ela estava colada neste bloco, que entra em toda geração — então um
 * carrossel sobre rotina matinal carregava um parágrafo sobre não pôr dois
 * executivos em lados opostos do quadro. Rivalidade não tem nada a ver com
 * figura pública: "Aparência vs realidade" é rivalidade sem gente famosa, e
 * "Sam Altman explica X" é figura pública sem rivalidade. São duas perguntas
 * diferentes, e agora são dois blocos. Ver `RIVALRY`.
 */
const PUBLIC_FIGURES =
  'When real public figures are explicitly part of the editorial subject, recognizable editorial representations are allowed: real people in a premium editorial photograph; do not caricature them and do not turn them into fictional characters.';

/**
 * RIVALIDADE — o bloco condicional, e o unico lugar que fala de versus.
 *
 * A EVIDENCIA: para "OpenAI vs Anthropic" voltou exatamente o cliche que o
 * prompt mandava evitar — uma pessoa a esquerda, outra a direita, divisor
 * luminoso vertical no meio, lado frio contra lado quente, poses espelhadas. A
 * regra existia, em UMA frase ("avoid simplistic symmetrical versus
 * compositions"), colada no fim do bloco de figuras publicas. Fraca demais, e
 * no lugar errado.
 *
 * Agora e um bloco forte, e so aparece quando ha rivalidade de verdade. O que
 * ele proibe e NOMEADO item por item, porque cliche generico ("evite o obvio")
 * o modelo nao consegue aplicar: divisor central, feixe luminoso, metades de
 * cor contrastante, poses espelhadas. E oferece o substituto, que e a parte que
 * faz a instrucao funcionar: um ambiente fotografico so, com a disputa contada
 * por tensao espacial, profundidade, linha de olhar e objeto em disputa.
 */
const RIVALRY =
  'RIVALRY FRAMING: this copy sets two entities against each other, and the cliche to avoid is the versus poster. Never stage one subject on the left and another on the right with a central divider, a luminous beam, contrasting colour halves or mirrored poses; avoid simplistic symmetrical versus compositions altogether. Stage the dispute inside one coherent photographic environment, using spatial tension, depth, eyelines, foreground objects, hierarchy between planes, reflections, competing actions, architecture, environmental storytelling, or a single object or space that both are contesting.';

/**
 * Tira acento e caixa. So para COMPARAR — nada disto entra no prompt.
 */
function normaliza(texto: string): string {
  return limpa(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * A copy poe DUAS ENTIDADES UMA CONTRA A OUTRA?
 *
 * Deteccao deterministica por texto, com limite de palavra, sem acento e sem
 * caixa. Nenhuma IA, nenhuma lista de marcas, nenhuma chamada nova — e a mesma
 * entrada sempre da a mesma resposta.
 *
 * 🔴 POR QUE DETECTAR POR TEXTO E SEGURO AQUI, que e o contrario da conclusao a
 * que chegamos para marcas. La o erro era assimetrico e caro: um nome fora da
 * lista nao ativava, e um nome comum ativava errado ("Apple" numa copy sobre
 * maca), mudando o EXCLUDE sem ninguem pedir. Aqui o FALSO POSITIVO E BENIGNO —
 * chega a ser desejavel. Se "Aparencia vs realidade" disparar o bloco, o
 * conselho entregue e "nao faca poster de dois lados", que e exatamente o
 * cliche a evitar tambem ali. Nao ha nada a perder quando dispara sem precisar.
 *
 * O risco real e o FALSO NEGATIVO: "a guerra ENTRE X e Y" e "X ou Y?" nao casam
 * com gatilho nenhum. E por isso que a clausula curta anti-simetria ficou no
 * `CONCEPT`, que entra sempre — ver o comentario la.
 *
 * 🔴 O "X" DE CONFRONTO, achado no USO REAL e nao em teste. O Rafael escreveu
 * "Codex x Claude Code" e o bloco nao entrou. No Brasil o X e a forma MAIS
 * comum de escrever confronto ("Flamengo x Vasco"), entao a falha era grande.
 *
 * Mas um `\bx\b` cru seria PIOR que a falha, porque o x tambem e aritmetica:
 *   "1080 x 1350"       dimensao — e o tamanho dos proprios slides do produto,
 *                       entao vai aparecer em copy sobre o produto;
 *   "10 x mais rapido"  multiplicacao;
 *   "3 x por semana"    frequencia, comunissimo em copy de habito e treino.
 *
 * A LINHA QUE SEPARA os tres de um confronto e uma so: LETRA DOS DOIS LADOS.
 * `[a-z]\s[x\u00d7]\s[a-z]` exige letra, espaco, o x isolado, espaco e letra.
 * Digito de QUALQUER lado desqualifica, e e por isso que os tres caem: em
 * "1080 x 1350" ha digito nos dois lados, em "10 x mais rapido" e "3 x por
 * semana" ha digito a esquerda. Nao precisei enumerar caso nenhum — a regra
 * derruba os tres pelo mesmo motivo, que e o sinal de que ela e a regra certa e
 * nao um remendo para os exemplos que eu conhecia.
 *
 * O espaco em volta tambem faz trabalho: ele garante que o x e uma PALAVRA
 * sozinha, entao `xadrez`, `box` e `linux` nao entram por dentro.
 *
 * O `\u00d7` (o sinal de multiplicacao de verdade) entra na mesma classe de
 * caracteres, e NAO traz risco novo: ele significa a mesma coisa que o x e cai
 * na mesma regra de digito. Ele aparece quando o texto vem colado de outro
 * lugar — e texto colado e justamente o caso em que o usuario nao escolheu o
 * caractere e nao faria ideia de por que o bloco nao entrou.
 *
 * `contra` FICA, e o argumento e o mesmo: "5 dicas contra a procrastinacao"
 * dispara, e o bloco entregue continua sendo bom conselho, porque ha oposicao
 * implicita ali tambem (voce contra o habito) e o poster simetrico continua
 * sendo o cliche. O limite de palavra ja protege do que importa: `contradicao`,
 * `contraste` e `encontrar` NAO casam, porque nao ha fronteira depois de
 * `contra` em nenhum dos tres.
 */
function temRivalidade(texto: string): boolean {
  const t = normaliza(texto);
  // O "x" de confronto exige LETRA dos dois lados, e é essa a linha inteira
  // entre confronto e aritmética. Ver o comentário acima da função.
  return /\bvs\b|\bversus\b|\bcontra\b|\bquem ganha\b|[a-z]\s[x\u00d7]\s[a-z]/.test(t);
}

const IMPACT =
  'Build one unmistakable focal point and a strong visual hierarchy. Use perspective, scale, tension, texture, environment, lighting or an unusual but believable camera position to make the frame memorable. Among multiple valid metaphors, prefer the one that is easiest to understand at a glance while still feeling visually unexpected and distinctive.';

export interface ImagePromptInput {
  title: string;
  description?: string;
  isCover?: boolean;
  isFinal?: boolean;
  /** Formato do lugar onde a imagem cai no slide. */
  shape?: ImageShape;
  /** Claridade da superfície do destino. Ausente = `dark`, como sempre foi. */
  surface?: ImageSurface;
  /** Direção livre do usuário (textarea do painel de IA). */
  userPrompt?: string;
  /** Contexto de marca do onboarding. Só paleta e tom chegam aqui — ver abaixo. */
  brand?: BrandContext | null;
  /** O que amarra as N imagens de um mesmo carrossel. Ver `seriesDirective`. */
  series?: ImageSeries;
  /**
   * Existe foto de referência nesta geração. A rota já sabe disso — é o mesmo
   * `referenceImageUrl` que decide `images.edit` — e até aqui não contava ao
   * prompt.
   *
   * 🔴 É a ÚNICA pergunta que o builder faz sobre a referência, e de propósito.
   * Não existe campo dizendo O QUE a foto é: o painel aceita produto, cenário
   * ou pessoa, e quem consegue olhar a foto e decidir é o modelo, que a recebe
   * junto no `images.edit`. Ver `IDENTITY`.
   */
  hasReference?: boolean;
}

/**
 * A âncora de COERÊNCIA entre os slides de um mesmo carrossel.
 *
 * O problema real: cada slide é uma chamada independente à OpenAI, e nada
 * ligava as N imagens. Um deck saía com 6 fotos que não pareciam do mesmo
 * ensaio.
 *
 * A solução aqui NÃO inventa estado no banco e NÃO mexe no fluxo de lote: os
 * dois campos são de DECK, não de slide, então o cliente calcula uma vez e
 * manda o MESMO valor em todas as chamadas do lote. Prompt idêntico nessa
 * camada em todas as N chamadas é o que dá ao modelo um alvo comum.
 *
 * Não é garantia — imagem gerada nunca é determinística do lado da OpenAI. É a
 * âncora mais forte que dá para pôr sem guardar estado entre chamadas.
 */
export interface ImageSeries {
  /** Título do carrossel — o mesmo para todos os slides do deck. */
  deckTitle?: string;
  /** Quantas imagens o lote vai gerar. */
  size?: number;
  /**
   * Posição 1-based DESTE slide dentro do DECK — a única coisa que difere
   * entre as N chamadas do lote. Opcional: sem ela o prompt sai idêntico ao de
   * antes. Ver `seriesShotCue`.
   */
  index?: number;
}

/**
 * OS CINCO ENQUADRAMENTOS DO ENSAIO.
 *
 * O problema que isto ataca é o efeito colateral da própria série: como as N
 * chamadas recebiam texto IDÊNTICO na camada de arte, o modelo tendia ao mesmo
 * plano seis vezes. O deck saía coerente e monótono — seis planos médios da
 * mesma cena, que é o que um ensaio de verdade justamente não é.
 *
 * A lista é de ENQUADRAMENTO, e só. Luz, grade de cor, lente e tratamento
 * continuam vindo iguais da frase de série: é essa divisão que deixa o deck
 * variado sem deixar de parecer o mesmo ensaio.
 *
 * 🔴 Nenhuma cue fala de orientação. Orientação sai de UM lugar só — a camada
 * COMPOSITION, derivada do `shape` — e uma cue que dissesse "wide" ou "tall"
 * recriaria a contradição que a task passada matou.
 */
const SHOT_CUES = [
  'Favour an environmental or establishing view with clear spatial context.',
  'Favour a medium contextual view with strong subject separation.',
  'Favour a tighter tactile detail or close-up when appropriate.',
  'Favour an unusual but believable camera angle, perspective or sense of scale.',
  'Favour a clean hero composition with strong geometry and immediate subject recognition.',
] as const;

/** Colapsa espaço e apara — texto de usuário entra em uma linha só. */
function limpa(texto: string | undefined | null): string {
  return String(texto ?? '').replace(/\s+/g, ' ').trim();
}

/** Fecha a frase com ponto, sem duplicar o que já termina pontuado. */
function frase(texto: string): string {
  return /[.!?]$/.test(texto) ? texto : `${texto}.`;
}

/**
 * O que do contexto de marca serve para uma FOTO.
 *
 * 🔴 Só PALETA e TOM. O `brand-context` foi escrito para o agente de TEXTO, e
 * carrega nicho, público, história da marca e dores do público — até 200
 * caracteres de prosa cada. Isso é briefing de copy: mandar para um modelo de
 * imagem não melhora a foto, dilui o assunto (que já vem do título do slide) e
 * ainda empurra o modelo a DESENHAR aquelas palavras dentro da imagem, que é
 * exatamente o que a camada EXCLUDE passa o prompt inteiro tentando impedir.
 *
 * Paleta e tom são direção de arte de verdade: a paleta vira grade de cor, e o
 * tom vira o clima da luz. Os dois cabem numa frase.
 */
export function brandArtDirection(brand: BrandContext | null | undefined): string {
  if (!brand) return '';
  const partes: string[] = [];

  const paleta = brand.palette.filter((c) => typeof c === 'string' && c.trim() !== '');
  if (paleta.length > 0) {
    partes.push(
      `Grade the image toward the brand palette (${paleta.join(', ')}) — as the colour of light, materials and surfaces in the scene, never as graphic overlays or colour blocks`,
    );
  }

  const tom = limpa(brand.tone);
  if (tom) partes.push(`The mood should read as: ${tom}`);

  return partes.length > 0 ? partes.map(frase).join(' ') : '';
}

/**
 * A frase de série. Idêntica em todas as chamadas do mesmo lote — é essa
 * repetição literal que faz as N imagens mirarem o mesmo lugar.
 */
export function seriesDirective(series: ImageSeries | undefined): string {
  // 🔴 Série exige MAIS DE UMA imagem. Uma imagem sozinha não é um ensaio, e
  // mandar "mantenha a coerência com o conjunto" numa geração avulsa promete
  // consistência com imagens que não estão sendo geradas — ruído que só pode
  // atrapalhar o único quadro que o usuário vai receber.
  const total = typeof series?.size === 'number' && series.size > 1 ? Math.trunc(series.size) : 0;
  if (!total) return '';

  const titulo = limpa(series?.deckTitle);
  const deck = titulo ? ` for the carousel "${titulo}"` : '';
  return frase(
    `This image belongs to a cohesive set of ${total} images${deck}. Keep lighting, colour grade, lens character, material palette and subject treatment consistent across the whole set — only the subject matter changes from image to image`,
  );
}

/**
 * O ENQUADRAMENTO deste slide dentro do ensaio. Determinístico por aritmética:
 * a posição no deck escolhe a cue, e a mesma posição escolhe sempre a mesma.
 *
 * 🔴 POR QUE ISTO NÃO EXIGE SÉRIE, ao contrário de `seriesDirective`.
 *
 * `seriesDirective` ignora `size` menor que 2 de propósito, e o motivo está
 * escrito lá em cima: aquela frase PROMETE coerência com um conjunto, e
 * prometer conjunto para uma imagem avulsa é ruído no único quadro que o
 * usuário vai receber. O shot cue não tem esse defeito — ele não cita imagem
 * nenhuma, não promete nada, só diz o enquadramento DESTA. Sozinho, continua
 * fazendo sentido.
 *
 * E exigir série aqui seria PIOR na prática: quando o usuário regera só o
 * slide 3 de um deck de 6, ele perderia justamente o enquadramento que aquele
 * slide tinha no lote — a imagem nova voltaria com plano diferente das
 * vizinhas, que é o contrário do que esta fatia existe para fazer.
 *
 * É por isso também que o índice é do DECK e não da POSIÇÃO NO LOTE: o lote é
 * "deste slide em diante", então a posição dentro dele muda conforme onde o
 * usuário clicou. O índice do deck é a identidade estável do slide, igual no
 * lote e na regeração avulsa.
 *
 * Índice inválido (zero, negativo, fracionário, NaN, infinito) devolve string
 * vazia e o prompt sai como antes — o valor vem do cliente, e um `undefined` no
 * meio da camada seria pior que cue nenhuma.
 */
export function seriesShotCue(series: ImageSeries | undefined): string {
  const bruto = series?.index;
  if (typeof bruto !== 'number' || !Number.isFinite(bruto)) return '';
  const index = Math.trunc(bruto);
  if (index < 1) return '';
  return SHOT_CUES[(index - 1) % SHOT_CUES.length];
}

/**
 * Monta o prompt final, camada por camada.
 *
 * As camadas são NOMEADAS no texto entregue à OpenAI, e não fundidas numa
 * frase só: assim cada instrução tem endereço, o modelo não mistura
 * enquadramento com acabamento, e quem for depurar consegue ler o prompt e
 * dizer qual camada errou. Camada vazia não aparece — prompt com rótulo órfão
 * ("ART DIRECTION:" seguido de nada) é ruído que o modelo tenta interpretar.
 */
export function buildImagePrompt(input: ImagePromptInput): string {
  const {
    title,
    description,
    isCover,
    isFinal,
    shape = 'full-bleed',
    surface = 'dark',
    userPrompt,
    brand,
    series,
    hasReference,
  } = input;

  // A ÚNICA condição que ainda vive do nosso lado: existe foto de entrada ou
  // não. O que a foto MOSTRA é pergunta para quem consegue olhar para ela.
  const referencia = !!hasReference;

  const assunto = [limpa(title), limpa(description)].filter(Boolean).join(' — ');
  const intent = isCover ? INTENT.cover : isFinal ? INTENT.final : INTENT.middle;

  // A COPY COMO CONTEXTO, NÃO COMO CENA. As aspas e o rótulo em caixa alta são
  // o mecanismo inteiro: sem eles o modelo trata a frase como descrição do que
  // fotografar e, pior, tenta ESCREVER a frase dentro da imagem — o que a
  // camada EXCLUDE passa o prompt todo tentando impedir.
  //
  // Sem título nem descrição não existe copy para contextualizar: o bloco some
  // e o slide cai no assunto genérico de sempre. Rótulo de contexto semântico
  // seguido de aspas vazias seria pior que não ter rótulo.
  const copy = assunto
    ? `The following Portuguese source copy is SEMANTIC CONTEXT ONLY: "${assunto}". Never reproduce, quote, translate, spell or display this copy inside the image.`
    : 'No source copy was supplied for this slide: build the concept around the topic of this slide.';

  // RIVALIDADE: lida do texto que o usuário escreveu, nunca de sinalizador. A
  // direção livre entra na conta porque "faça um duelo entre os dois" é rivalidade
  // tanto quanto um "vs" no título.
  //
  // 🔴 E o pedido EXPLÍCITO de split-screen desliga o bloco. Se o usuário digitou
  // que quer a tela dividida, isso é direção criativa dele, não requisito
  // técnico — e entregar um parágrafo proibindo exatamente o que ele acabou de
  // pedir faria o prompt brigar consigo mesmo na frente do modelo.
  const direcao = limpa(userPrompt);
  const pediuSplitScreen = /\bsplit[- ]?screens?\b|\btela dividida\b/.test(normaliza(direcao));
  const rivalidade = !pediuSplitScreen && temRivalidade([title, description, direcao].join(' '));

  // ART DIRECTION empilha, nesta ordem: marca (o que é do usuário e vale para
  // o deck todo), atmosfera (do destino), realismo e impacto (a linguagem
  // visual do produto), série (a âncora comum), o enquadramento deste slide
  // dentro do ensaio — a ÚNICA parte que difere entre as N chamadas do lote,
  // e que por isso vem logo depois da âncora — e por último a direção livre —
  // que vem depois de propósito, para o pedido explícito do usuário ser a
  // última palavra dentro da camada.
  //
  // 🔴 A direção do usuário ganhou moldura de PRIORIDADE, e o limite dela é
  // dito na mesma frase: composição técnica, fidelidade de identidade e
  // exclusões não são negociáveis por textarea. A moldura vem ANTES do pedido,
  // não depois, para o texto do usuário continuar sendo literalmente a última
  // coisa que o modelo lê nesta camada.
  const arte = [
    brandArtDirection(brand),
    ATMOSPHERE[surface] ?? ATMOSPHERE.dark,
    REALISM,
    IMPACT,
    seriesDirective(series),
    seriesShotCue(series),
    direcao
      ? `Prioritize the following user direction whenever it does not conflict with technical composition, identity fidelity or exclusion requirements. ${frase(`Additional art direction: ${direcao}`)}`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Os módulos entram DEPOIS do parágrafo de sempre, nunca no meio dele: assim a
  // frase que carrega a copy e a exigência de conceito continua sendo uma
  // unidade fechada, e a compatibilidade não depende de eu ter acertado a
  // pontuação no meio de uma frase montada.
  //
  // 🔴 Só o bloco de identidade é condicional AQUI. O de figuras públicas entra
  // sempre, porque a condição dele já está escrita no próprio texto e é o
  // modelo quem a avalia — ver `PUBLIC_FIGURES`.
  const sujeito = [
    `${intent.label}. ${copy} ${CONCEPT} ${intent.cue}`,
    referencia ? IDENTITY : '',
    PUBLIC_FIGURES,
    rivalidade ? RIVALRY : '',
  ]
    .filter(Boolean)
    .join(' ');

  const conteudo: Record<Layer, string> = {
    ROLE: referencia ? ROLE_REFERENCE : ROLE,
    SUBJECT: sujeito,
    'ART DIRECTION': arte,
    COMPOSITION: COMPOSITION[shape] ?? COMPOSITION['full-bleed'],
    EXCLUDE,
    OUTPUT,
  };

  return LAYERS.filter((camada) => conteudo[camada] !== '')
    .map((camada) => `${camada}: ${conteudo[camada]}`)
    .join('\n');
}
