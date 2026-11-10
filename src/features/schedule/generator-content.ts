/**
 * Conteúdo PLANEJADO do gerador de cronograma (ET-007). São sugestões editáveis, não estudos realizados:
 * nada aqui é gravado no banco até o usuário confirmar a geração, e nunca como aula/estudo concluído.
 * As descrições das músicas citam apenas título, artista, tema e palavras soltas — sem letras.
 */

export interface StepTemplate {
  title: string
  minutes: number
}

/** Modelo de aula ChatGPT — 60 min (6 blocos). */
export const LESSON_BLOCKS: StepTemplate[] = [
  { title: 'Revisão e vocabulário', minutes: 10 },
  { title: 'Gramática com exercícios', minutes: 15 },
  { title: 'Listening — compreensão auditiva', minutes: 10 },
  { title: 'Reading — interpretação', minutes: 10 },
  { title: 'Speaking — conversação', minutes: 10 },
  { title: 'Revisão final e desafio', minutes: 5 },
]

/** Modelo de estudo musical — 60 min (5 etapas). */
export const MUSIC_BLOCKS: StepTemplate[] = [
  { title: 'Primeira escuta sem letra', minutes: 10 },
  { title: 'Vocabulário e expressões', minutes: 15 },
  { title: 'Tradução e interpretação', minutes: 15 },
  { title: 'Pronúncia e prática oral', minutes: 10 },
  { title: 'Escuta final e avaliação', minutes: 10 },
]

export interface LessonTheme {
  number: number
  title: string
  topics: string[]
  /** uma descrição por bloco de LESSON_BLOCKS, na mesma ordem */
  steps: [string, string, string, string, string, string]
}

export const LESSON_THEMES: LessonTheme[] = [
  {
    number: 4,
    title: 'Family, Articles & Possessives',
    topics: ['Artigos a/an', 'Possessivos my, your, his, her', 'Vocabulário de família', 'Descrição de pessoas e objetos'],
    steps: [
      'Revisar a aula anterior e aprender o vocabulário de família: mother, father, brother, sister, husband, wife, son, daughter.',
      'Artigos a/an (a son, an uncle) e possessivos my, your, his, her, its, our, their; exercícios de completar frases.',
      'Ouvir alguém apresentando a própria família e identificar os parentescos e os possessivos usados.',
      'Ler um texto curto sobre uma família e responder quem é quem e de quem são os objetos citados.',
      'Apresentar a sua família e descrever pessoas e objetos usando a/an e possessivos.',
      'Revisar os erros com artigos e possessivos; desafio: escrever e falar 5 frases sobre um familiar.',
    ],
  },
  {
    number: 5,
    title: 'This, That, These & Those',
    topics: ['Demonstrativos', 'Singular e plural', 'Objetos da casa e do escritório', 'Perguntas e respostas sobre objetos'],
    steps: [
      'Revisar os possessivos e aprender objetos da casa e do escritório: desk, chair, lamp, keys, notebook, cup.',
      'This/that (singular) e these/those (plural), perto e longe; plural com -s/-es; exercícios de escolha.',
      'Ouvir diálogos curtos em casa e no escritório e marcar qual demonstrativo é usado em cada fala.',
      'Ler a descrição de um cômodo e associar cada objeto à posição perto ou longe de quem fala.',
      'Fazer e responder perguntas sobre objetos: "What\'s this?", "Are those your keys?", "Is that a lamp?".',
      'Revisar singular e plural; desafio: descrever 6 objetos ao seu redor com this/that/these/those.',
    ],
  },
  {
    number: 6,
    title: 'Have, Has & Describing People',
    topics: ['Have/has', 'Adjetivos de aparência e personalidade', 'Descrição de amigos e familiares', 'Concordância verbal'],
    steps: [
      'Revisar os demonstrativos e aprender adjetivos de aparência (tall, short, curly hair) e personalidade (friendly, shy, funny).',
      'Have com I/you/we/they e has com he/she/it; negativas e perguntas com don\'t/doesn\'t have; exercícios de concordância.',
      'Ouvir descrições de pessoas e identificar quem está sendo descrito em cada áudio.',
      'Ler o perfil de um amigo e responder perguntas sobre a aparência e a personalidade dele.',
      'Descrever um amigo e um familiar usando have/has e os adjetivos da aula.',
      'Revisar a concordância he/she has; desafio: descrever uma pessoa famosa em 5 frases.',
    ],
  },
  {
    number: 7,
    title: 'Wh- Questions',
    topics: ['What, where, who, when, why e how', 'Perguntas com do/does', 'Perguntas com verb to be', 'Conversações cotidianas'],
    steps: [
      'Revisar have/has e o vocabulário de perguntas do dia a dia: job, home, routine, weekend, favorite.',
      'What, where, who, when, why e how; ordem da pergunta com verb to be e com do/does; exercícios de montar perguntas.',
      'Ouvir uma entrevista curta e anotar as perguntas feitas e as respostas dadas.',
      'Ler um diálogo cotidiano e identificar a palavra interrogativa e o auxiliar de cada pergunta.',
      'Simular uma conversa de apresentação fazendo e respondendo Wh- questions.',
      'Revisar do/does × verb to be; desafio: preparar 6 perguntas para conhecer alguém.',
    ],
  },
  {
    number: 8,
    title: 'Places & Prepositions',
    topics: ['Lugares da cidade', 'In, on, at', 'Next to, behind, between, under', 'Descrição de localização'],
    steps: [
      'Revisar as Wh- questions e aprender lugares da cidade: bank, bakery, pharmacy, park, station, supermarket.',
      'Preposições in, on, at e next to, behind, between, under; exercícios de completar e de descrever posições.',
      'Ouvir indicações de localização e marcar num mapa simples onde fica cada lugar.',
      'Ler a descrição de um bairro e responder perguntas do tipo "Where is the bakery?".',
      'Descrever o seu bairro e dizer onde ficam 4 lugares que você frequenta.',
      'Revisar as preposições; desafio: explicar onde estão os objetos do seu quarto.',
    ],
  },
  {
    number: 9,
    title: 'Likes, Dislikes & Free Time',
    topics: ['Like/love/enjoy + -ing', "Don't/doesn't like", 'Hobbies e preferências', 'Diálogos sobre tempo livre'],
    steps: [
      'Revisar as preposições e aprender hobbies: reading, cooking, playing guitar, watching series, running.',
      'Like/love/enjoy + -ing e don\'t/doesn\'t like; regras de ortografia do -ing; exercícios.',
      'Ouvir pessoas falando sobre o tempo livre e marcar o que cada uma gosta e não gosta de fazer.',
      'Ler um post sobre o fim de semana de alguém e identificar as preferências citadas.',
      'Conversar sobre os seus hobbies e perguntar "What do you like doing in your free time?".',
      'Revisar like + -ing; desafio: comparar as suas preferências com as de um amigo.',
    ],
  },
  {
    number: 10,
    title: 'A1 Review & Progress Assessment',
    topics: ['Revisão dos conteúdos estudados', 'Avaliação de gramática', 'Listening e Reading', 'Speaking', 'Registro de dificuldades e recomendações'],
    steps: [
      'Revisão geral do vocabulário das aulas anteriores: família, objetos, pessoas, perguntas, lugares e hobbies.',
      'Avaliação de gramática: verb to be, a/an, possessivos, demonstrativos, have/has, Wh- questions, preposições e like + -ing.',
      'Listening de avaliação: um diálogo de nível A1 com perguntas de compreensão.',
      'Reading de avaliação: um texto de nível A1 com perguntas de interpretação.',
      'Speaking de avaliação: apresentação pessoal de 2 minutos usando os conteúdos do nível A1.',
      'Registrar no app as dificuldades, as recomendações e a nota de cada bloco desta aula.',
    ],
  },
]

export interface MusicTheme {
  number: number
  song: string
  artist: string
  focus: string
  /** uma descrição por etapa de MUSIC_BLOCKS, na mesma ordem */
  steps: [string, string, string, string, string]
}

export const MUSIC_THEMES: MusicTheme[] = [
  {
    number: 2,
    song: 'Stand by Me',
    artist: 'Ben E. King',
    focus: 'amizade, apoio e expressões cotidianas',
    steps: [
      'Ouvir "Stand by Me" sem letra e anotar as palavras que reconhecer e o clima da música (apoio, amizade).',
      'Vocabulário de apoio e amizade e expressões cotidianas, como "stand by" (ficar ao lado de alguém); registrar no vocabulário.',
      'Traduzir e interpretar trechos curtos escolhidos por você: o que significa estar ao lado de alguém.',
      'Praticar a pronúncia do título e das palavras-chave; repetir em voz alta trechos curtos.',
      'Ouvir de novo sem letra, comparar com a primeira escuta e registrar a compreensão final (0 a 10).',
    ],
  },
  {
    number: 3,
    song: 'Hello, Goodbye',
    artist: 'The Beatles',
    focus: 'saudações, opostos e frases simples',
    steps: [
      'Primeira escuta sem letra: identificar as saudações e os pares de opostos que você reconhecer.',
      'Vocabulário de saudações (hello, goodbye) e de opostos (yes/no, high/low, stop/go); montar uma lista de pares.',
      'Interpretar trechos curtos: como a música brinca com ideias opostas usando frases simples.',
      'Pronúncia: repetir as saudações e os pares de opostos, com atenção ao som do "h" de hello.',
      'Escuta final: verificar quantos opostos você entende agora e registrar a nota de compreensão.',
    ],
  },
  {
    number: 4,
    song: 'What a Wonderful World',
    artist: 'Louis Armstrong',
    focus: 'cores, natureza e descrições',
    steps: [
      'Escuta sem letra: anotar as cores e os elementos da natureza que você reconhecer.',
      'Vocabulário de cores, natureza (trees, sky, clouds, roses) e adjetivos de descrição.',
      'Interpretar trechos curtos: como o cantor descreve o mundo; descrever uma paisagem com as palavras aprendidas.',
      'Pronúncia: aproveitar o ritmo lento para praticar os sons de "th" (the, think) e de "w" (world, wonderful).',
      'Escuta final e avaliação da compreensão; registrar as palavras novas.',
    ],
  },
  {
    number: 5,
    song: "I'm Yours",
    artist: 'Jason Mraz',
    focus: 'contrações e reconhecimento auditivo',
    steps: [
      'Escuta sem letra: perceber a fala rápida e anotar as palavras e contrações que reconhecer.',
      "Vocabulário e contrações (I'm, you're, it's, don't, can't, won't) e expressões informais.",
      'Interpretar trechos curtos: o tom descontraído e a mensagem de aproveitar o momento.',
      'Pronúncia e reconhecimento auditivo: identificar contrações na fala rápida e repeti-las em ritmo lento.',
      'Escuta final: contar quantas contrações você reconhece agora e registrar a nota.',
    ],
  },
  {
    number: 6,
    song: 'Yellow',
    artist: 'Coldplay',
    focus: 'cores, sentimentos e vocabulário cotidiano',
    steps: [
      'Escuta sem letra: identificar a cor do título e as palavras sobre sentimentos.',
      'Vocabulário de cores, sentimentos e palavras do dia a dia (stars, shine, look, write).',
      'Interpretar trechos curtos: o que a cor amarela representa na música.',
      'Pronúncia: o som de "y" em yellow e as vogais longas; repetir as palavras-chave.',
      'Escuta final e avaliação; comparar com a primeira escuta.',
    ],
  },
  {
    number: 7,
    song: 'Let It Be',
    artist: 'The Beatles',
    focus: 'sentimentos, expressões e pronúncia',
    steps: [
      'Escuta sem letra: perceber o tom de conselho e consolo e anotar as palavras reconhecidas.',
      'Vocabulário: a expressão "let it be" (deixar estar) e palavras sobre sentimentos e momentos difíceis.',
      'Interpretar o sentido de aceitar as situações; traduzir trechos curtos escolhidos por você.',
      'Pronúncia dos sons de "l" e "t" e da ligação entre as palavras do título; repetir devagar.',
      'Escuta final e avaliação da compreensão.',
    ],
  },
  {
    number: 8,
    song: "You've Got a Friend",
    artist: 'Carole King',
    focus: 'amizade, have got e apoio emocional',
    steps: [
      'Escuta sem letra: identificar o tema de amizade e as palavras que reconhecer.',
      "Vocabulário: have got / has got (= ter), a contração you've got e palavras de amizade e apoio emocional.",
      'Interpretar trechos curtos: como a música expressa apoio a um amigo; comparar have got × have.',
      "Pronúncia da contração you've got e da ligação entre as palavras; repetir trechos curtos.",
      'Escuta final e avaliação; registrar as dificuldades.',
    ],
  },
]

export interface ComplementaryTemplate {
  slug: string
  title: string
  description: string
  minutes: number
  skill: string
}

/** Ciclo semanal de complementares: 1 = segunda … 7 = domingo (independe da data de início). */
export const COMPLEMENTARY_BY_WEEKDAY: Record<number, ComplementaryTemplate[]> = {
  1: [{ slug: 'duolingo', title: 'Duolingo', description: 'Praticar vocabulário e frases do conteúdo atual.', minutes: 20, skill: 'vocabulary' }],
  2: [{ slug: 'podcast-a1', title: 'Podcast A1', description: 'Primeira escuta, escuta com transcrição e repetição de frases.', minutes: 30, skill: 'listening' }],
  3: [{ slug: 'bbc-learning-english', title: 'BBC Learning English', description: 'Vídeo curto, exercícios e registro de expressões.', minutes: 25, skill: 'listening' }],
  4: [
    { slug: 'duolingo', title: 'Duolingo', description: 'Praticar vocabulário e frases do conteúdo atual.', minutes: 20, skill: 'vocabulary' },
    { slug: 'flashcards', title: 'Flashcards no My English Journey', description: 'Revisar as palavras pendentes em Revisões.', minutes: 10, skill: 'review' },
  ],
  5: [{ slug: 'serie', title: 'Série em inglês', description: 'Cena curta, legendas em inglês e repetição das falas.', minutes: 30, skill: 'listening' }],
  6: [{ slug: 'leitura-a1', title: 'Leitura A1', description: 'Leitura, interpretação e revisão de vocabulário.', minutes: 30, skill: 'reading' }],
  7: [{ slug: 'revisao-conversacao', title: 'Revisão e conversação', description: 'Flashcards, prática oral e identificação de dificuldades.', minutes: 30, skill: 'speaking' }],
}
