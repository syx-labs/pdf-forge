# Design — Extensão do `pdf-forge` para criativos e carrosséis de Instagram

**Data**: 2026-04-20
**Autor**: Gabriel Falcão + Claude (brainstorming)
**Status**: Design validado, aguardando plano de implementação
**Skill impactada**: `pdf-forge` (em `~/Projects/personal/skills/pdf-forge`)

## Resumo executivo

Adicionar um terceiro formato de output ao `pdf-forge` (`social`), ao lado dos existentes `slides` e `docs`, para gerar criativos e carrosséis de Instagram com o mesmo pipeline HTML+Tailwind+Playwright já consolidado. A extensão reaproveita ~80% do core (renderer, brand config, merge pipeline), adiciona cinco presets de aspect ratio, dez arquétipos de template, um sistema de temas flexível com escape hatch, e um "Reference Mode" que permite alimentar imagens inspiradoras e gerar novos posts na mesma gramática visual.

## Motivação

O `pdf-forge` já estabeleceu um design system rígido e de alta qualidade (zinc backbone, tracking tokens negativos, um gradient de accent, tipografia Inter) que gera PDFs e slides de nível profissional. O mesmo aparato visual serve diretamente à maior parte das necessidades de Instagram (B2B, educacional, editorial) — falta apenas adaptar para as aspect ratios e arquétipos específicos da plataforma, mais flexibilidade de tema para quando o projeto pedir (campanha específica, cliente com branding próprio, experimentação visual).

Em vez de criar uma skill separada que duplicaria o core, estender `pdf-forge` mantém uma skill só, uma brand config só, um pipeline só — e abre caminho para uma camada "creative-forge" no futuro, caso o escopo continue crescendo.

## Decisões-chave

1. **Formato `social` como extensão, não skill nova.** Terceiro valor do union type `Format`.
2. **Cinco sub-formatos** cobrindo os casos de uso do Instagram: `post-1-1`, `post-4-5`, `carousel-1-1`, `carousel-4-5`, `story`.
3. **Dez arquétipos prebuild** × 5 aspect ratios = 50 templates iniciais. Não todo arquétipo faz sentido em todo formato — os não-aplicáveis documentados explicitamente.
4. **Theme system em camadas**: defaults do pdf-forge → presets empacotados → brand config local (`.claude/pdf-forge.local.md` com seção `social:`) → overrides inline no HTML. Resolução top-down com fallback.
5. **Reference Mode** documentado como workflow no SKILL.md (não requer código novo): Claude lê imagem via vision, extrai gramática visual (grid, paleta, tipografia, densidade, mood), gera HTML em uma de três fidelidades (close match | style transfer | loose inspiration, default: style transfer).
6. **Escape hatch (HTML custom total)** preservado: usuário pode pedir para bypassar o design system em um post específico, mas viewport e safe zones continuam sendo forçados pelo renderer.
7. **Carrossel como sequência com narrativa**, não como N arquétipos soltos. Manifest.yaml gerado automaticamente com metadata da sequência.
8. **Output padronizado**: PNGs sequenciais + manifest.yaml + preview.html (opt-in) na pasta `rendered/`.

## Arquitetura

### Mudanças no core

- `src/core/types.ts`: `Format` ganha variante `"social"`. Novo tipo `SocialFormat = "post-1-1" | "post-4-5" | "carousel-1-1" | "carousel-4-5" | "story"`. Interface `RenderOptions` ganha campo opcional `socialFormat?: SocialFormat`.
- `src/core/renderer.ts`: quando `format === "social"`:
  - Lê `data-social-format` do `<body>` do HTML, ou usa `options.socialFormat` como override, ou falha com erro explícito.
  - Configura viewport baseada em tabela de presets (ver seção "Presets de formato").
  - Sempre screenshot PNG, nunca PDF, `deviceScaleFactor: 2` por default.
  - Valida consistência entre slides de um carrossel (mesmo sub-formato em todos os arquivos).
- `src/core/utils.ts#detectFormat`: decide `social` checando apenas o primeiro arquivo HTML (`htmlFiles[0]`) pela presença de `data-social-format` no `<body>`. A função não varre os demais arquivos — a consistência entre slides é validada depois pelo renderer.
- `scripts/render-pdf.ts`: aceita `--format social` e flag `--social-format <preset>`. Nome do script mantido (rename para `render.ts` fica fora do escopo).

### Presets de formato

| Sub-formato | Viewport | Device scale | Output PNG | Uso |
|---|---|---|---|---|
| `post-1-1` | 1080×1080 | 2x | 2160×2160 | Feed quadrado |
| `post-4-5` | 1080×1350 | 2x | 2160×2700 | Feed retrato |
| `carousel-1-1` | 1080×1080 | 2x | 2160×2160 | Carrossel quadrado |
| `carousel-4-5` | 1080×1350 | 2x | 2160×2700 | Carrossel retrato |
| `story` | 1080×1920 | 2x | 2160×3840 | Story / capa Reels |

Justificativa do 2x default: Instagram comprime agressivamente no upload; sobrar resolução protege contra degradação. Override via `--scale 1` disponível.

### Mudanças nos assets

```text
assets/templates/social/
├── _shared/
│   ├── boilerplate.html                # shell: Tailwind CDN, Inter, base CSS, data-social-format
│   ├── type-scales.md                  # escala de tipo por aspect ratio
│   └── safe-zones.md                   # zonas mortas (ex: story topo/rodapé)
├── cover/
│   ├── post-1-1.html
│   ├── post-4-5.html
│   ├── carousel-1-1.html
│   ├── carousel-4-5.html
│   ├── story.html
│   └── NOTES.md
├── mega-stat/
├── steps/
├── quote/
├── before-after/
├── definition/
├── checklist/
├── cta/
├── photo-overlay/
└── bento/
```

Total: 10 arquétipos × 5 formatos = 50 templates iniciais. Arquétipos não-aplicáveis em certos formatos (ex: `bento` em `story`) marcados com arquivo `NOT-APPLICABLE.md` explicando alternativas.

Variantes dentro do mesmo arquétipo+formato ficam numeradas (`quote/post-4-5-avatar.html`, `quote/post-4-5-minimal.html`) e listadas em `NOTES.md`.

### Type scales calibradas por formato

Um mesmo arquétipo precisa de tamanhos diferentes porque a viewport muda drasticamente. Exemplo do `mega-stat`:

| Formato | Mega number | Label | Body |
|---|---|---|---|
| `post-1-1` | `text-[180px]` | `text-lg` | `text-xl` |
| `post-4-5` | `text-[200px]` | `text-xl` | `text-2xl` |
| `carousel-1-1` | `text-[180px]` | `text-lg` | `text-xl` |
| `carousel-4-5` | `text-[200px]` | `text-xl` | `text-2xl` |
| `story` | `text-[240px]` | `text-2xl` | `text-3xl` |

`carousel-*` compartilha escala do `post-*` correspondente (mesma viewport). Documentado em `_shared/type-scales.md` com tabela completa por arquétipo.

### Safe zones por formato

- **`story` (9:16)**: 250px no topo (profile/status), 280px no rodapé (reply bar + action buttons). Conteúdo crítico em `y: 250 → 1640`.
- **`post-1-1` / `post-4-5`**: sem zona morta crítica, padding interno de 96px.
- **`carousel-*`**: mesmas regras do post + indicador visual de "deslize" no slide 1.

Aplicadas como classes Tailwind nos templates e documentadas em `_shared/safe-zones.md`.

## Theme system e brand config

Extensão do `.claude/pdf-forge.local.md` existente com bloco `social:` adicionado ao lado de `brand:` e `font:` (schema atual do pdf-forge preservado, sem migração).

**Schema atual (não modificado)**:

```yaml
---
brand:
  name: "Your Company"
  primary: "purple-500"
  secondary: "orange-500"
  theme: "dark"
font:
  url: "https://fonts.googleapis.com/css2?family=Inter:wght@100..900"
  family: "Inter"
---
```

**Schema estendido (com `social:` opcional)**:

```yaml
---
brand:
  name: "Yorus"
  primary: "purple-500"
  secondary: "orange-500"
  theme: "dark"
font:
  url: "https://fonts.googleapis.com/css2?family=Inter:wght@100..900"
  family: "Inter"
social:
  preset: "dark-editorial"                # opcional, referencia assets/themes/
  theme: "dark"                           # override do brand.theme só pro social
  accent_gradient: "from-purple-400 to-orange-400"
  allow_photos: true                      # libera arquétipo photo-overlay
  brand_handle: "@yorus"                  # usado em CTAs
  default_footer: true                    # mostra @handle discreto
  custom_palette:                         # override parcial da zinc backbone
    bg: "#0a0a0f"
    surface: "#18181b"
    text_primary: "#fafafa"
    text_secondary: "#a1a1aa"
    text_muted: "#71717a"
  fonts_override:                         # fonte display só pro social
    display:
      family: "Instrument Serif"
      url: "https://fonts.googleapis.com/css2?family=Instrument+Serif"
---
```

### Regras de merge

1. Se `social:` ausente, defaults do pdf-forge aplicam direto (dark + zinc + Inter + purple/orange). Arquivos existentes sem `social:` continuam funcionando.
2. `social.theme` e `social.accent_gradient` caem como fallback em `brand.theme` e nas cores de `brand.primary`+`brand.secondary`.
3. `social.preset` referencia um arquivo YAML em `assets/themes/`; valores locais do mesmo `social:` fazem override parcial em cima.
4. `custom_palette` é override parcial — chaves ausentes caem em zinc default.
5. `fonts_override.display` só afeta templates social; PDFs e slides permanecem em `font.family`.
6. Se `.claude/pdf-forge.local.md` não existir, defaults globais aplicam.

### Themes empacotados

Novo diretório `assets/themes/` com presets de referência:

```text
assets/themes/
├── dark-editorial.yaml                 # zinc + gradient (default)
├── light-editorial.yaml                # tons claros, finance/legal
├── warm-minimal.yaml                   # creme + preto, Kinfolk-style
├── high-contrast-punch.yaml            # preto + magenta elétrico
└── newsprint.yaml                      # bege + serif + ruído sutil
```

Uso:

```yaml
social:
  preset: "warm-minimal"
  accent_gradient: "from-emerald-400 to-cyan-400"       # override parcial
```

### Precedência de resolução de tema

1. Inline no HTML (`<!-- theme: light-editorial -->`)
2. Override no briefing do usuário ("faz esse post com tema light")
3. `social:` do `.claude/pdf-forge.local.md`
4. Preset default (`dark-editorial`)

## Reference Mode

Workflow documentado no SKILL.md. Não requer componente de código novo — Claude já tem vision.

### Entrada

Uma ou mais imagens (JPG/PNG/WebP) + briefing de conteúdo. Exemplo:

> "Olha esses 3 posts da @rauchg. Quero criar um carrossel de 5 slides sobre 'como escolher stack pra MVP' nessa mesma linguagem visual."

### Análise da referência (estruturada)

Claude descreve em texto visível o que extrai de cada imagem:

1. **Grid & layout**: posição do título, alinhamento, densidade, margens.
2. **Paleta**: 3 cores primárias, tone de background, mono/di/cromático.
3. **Tipografia**: serif/sans, contraste de weight, tracking (positivo/negativo/zero), hierarquia.
4. **Densidade**: razão content/whitespace (dense/balanced/spacious).
5. **Elementos visuais**: fotos, ilustração, blocos, bordas, shadows, texturas.
6. **Mood**: editorial / tech / playful / brutalist / minimal / maximal.
7. **Arquétipo reconhecido**: mapeia para o arquétipo interno mais próximo.

Usuário pode corrigir a leitura antes da geração. Isso dá controle e previne "guess" errado.

### Fidelidade (três modos)

- **Close match**: copia a gramática visual com máxima fidelidade. HTML custom, bypassa templates.
- **Style transfer** (default): usa o template do arquétipo adequado, aplica paleta/tipografia/densidade da referência em cima.
- **Loose inspiration**: mantém o design system do brand config, extrai só 1-2 elementos da referência.

Default `style transfer` se não especificado — o ponto médio produz resultado consistente sem sacrificar inspiração.

### Extração de paleta (opcional, fase 2)

Script `scripts/extract-palette.ts` que usa biblioteca de color quantization pra retornar paleta dominante da imagem como hex codes. Economiza tokens do Claude. Não é MVP — Claude pode ler cores via vision na primeira versão.

### Guardrails

- Não copia logos/texto literal da referência.
- Safe zones do formato de destino sempre aplicadas, mesmo que referência quebre.
- Se referência é `post-1-1` e destino é `story`, Claude faz reposicionamento vertical explícito — não estica.
- Fontes comerciais ausentes são substituídas por Google Fonts com características similares, com nota explícita no output.

## Carrossel como sequência

### Padrão narrativo recomendado

```text
01-hook.html              # cover (puxa atenção)
02-setup.html             # definition ou problema (contexto)
03-content-1.html         # steps/stat/quote (payload)
04-content-2.html
05-content-3.html
06-insight.html           # quote/definition (clímax)
07-cta.html               # cta (follow/save/link)
```

Entre 3 e 10 slides (limite do Instagram). Sweet spot: 5-7.

### Consistência entre slides

Todos os slides de um carrossel compartilham:
- Mesmo theme/preset
- Mesma aspect ratio (validado pelo renderer, aborta se mistura)
- Mesmo footer/branding (se `default_footer: true`)
- Contador automático (`01/07`, `02/07`, ...) gerado via ordem lexicográfica dos arquivos

### Briefing — duas formas aceitas

**Forma A — prose livre** (Claude compõe sequência):
> "Faz um carrossel de 5 slides sobre 'como escolher stack pra MVP'. Público: founders técnicos."

**Forma B — spec estruturada** (`brief.yaml`):

```yaml
carousel:
  format: carousel-4-5
  theme: dark-editorial
  slides:
    - archetype: cover
      headline: "Como escolher stack pra MVP"
      label: "Guide #12"
    - archetype: definition
      term: "Time to first user"
      body: "O único KPI que importa na fase zero"
    - archetype: steps
      label: "3 filtros"
      items:
        - "Você já conhece e escreve fluente"
        - "Comunidade ativa + docs decentes"
        - "Deploy/host sem drama"
    - archetype: quote
      text: "A stack certa é a que te leva ao primeiro usuário mais rápido"
    - archetype: cta
      action: "Salva pra consultar depois"
```

### Manifest gerado

`rendered/manifest.yaml` com metadata completa:

```yaml
carousel:
  format: carousel-4-5
  theme: dark-editorial
  generated_at: 2026-04-20T11:30:00-03:00
  slides:
    - file: 01-hook.png
      archetype: cover
      headline: "Como escolher stack pra MVP"
    - file: 02-definition.png
      archetype: definition
caption_suggestion: |
  <parágrafos opt-in via flag>
hashtag_suggestion:
  - "#mvp"
  - "#founder"
```

Manifest serve para: upload via Graph API, re-geração com edits pontuais, arquivamento/versionamento.

Posts únicos também geram manifest (com um slide só) — output padronizado.

Caption e hashtags são opt-in (`--caption` ou instrução no briefing). Default: só visual.

## Output e deliverables

### Estrutura de pastas por build

```text
projeto/
├── briefs/                             # opcional, forma B
│   └── 2026-04-20-mvp-stack.yaml
├── references/                         # imagens de referência
│   └── rauchg-carousel-1.png
├── pages/                              # HTML gerado
│   ├── 01-hook.html
│   └── ...
└── rendered/                           # output final
    ├── 01-hook.png
    ├── ...
    ├── manifest.yaml
    └── preview.html                    # opt-in
```

Espelha a convenção atual do pdf-forge (`pages/` + `rendered/`).

### preview.html

Grid visual estático com todos os PNGs em escala reduzida, metadata embutida, caption/hashtags sugeridos. Abre no browser para conferência rápida. Gerado por `scripts/generate-preview.ts`, opt-in via flag `--preview`.

### Comandos CLI

```bash
# Render um post/carrossel social
bun run scripts/render-pdf.ts ./pages/ --format social --output ./rendered/

# Override do sub-formato (fallback se HTML não declarar)
bun run scripts/render-pdf.ts ./pages/ --format social --social-format post-4-5

# Escala menor pra testes
bun run scripts/render-pdf.ts ./pages/ --format social --scale 1

# Gera preview após render
bun run scripts/generate-preview.ts ./rendered/ --output ./rendered/preview.html
```

### Arquivamento

Convenção sugerida (não imposta):

```text
creative-workflow/
├── 2026-04-20-mvp-stack-carousel/
│   ├── briefs/
│   ├── pages/
│   └── rendered/
└── 2026-04-18-roi-stat-post/
```

Documentada na SKILL.md como boa prática.

### Fora do escopo

Automação de upload para Instagram/Buffer/Later fica para skill separada futura. O manifest foi pensado para ser consumível, mas nada aqui publica.

## Error handling

### Validação de entrada

| Erro | Comportamento |
|---|---|
| HTML sem `data-social-format` e sem `--social-format` | Erro explícito listando valores válidos |
| `data-social-format` inválido | Lista valores válidos e aborta |
| Carrossel > 10 arquivos | Aborta: "Instagram aceita até 10 slides. Tem N." |
| Carrossel com aspect ratios mistos | Aborta listando inconsistência |
| Referência não-imagem | Aborta pedindo JPG/PNG/WebP |
| Referência > 10MB | Warning mas processa |
| Theme preset inexistente | Lista presets disponíveis + caminho para criar novo |
| Fonte override ausente localmente | Fallback para Inter + warning |

### Edge cases de render

- **Overflow de conteúdo** (texto excede viewport): renderer detecta `document.body.scrollHeight > viewport.height` pós-load — aborta indicando slide e tamanho estimado necessário. Nunca corta silenciosamente.
- **Fontes não carregadas** (timeout 10s): aborta com erro explícito — não renderiza com fonte errada.
- **Emoji**: funciona nativamente via system emoji stack. Documentado nas NOTES.
- **CI/headless**: Playwright já suporta.

### Edge cases de carrossel

- Carrossel com 1 slide: warning "considera usar format post-* direto", processa.
- Gap lexicográfico (`01`, `03`, sem `02`): processa na ordem encontrada, warning sobre gap. Contador auto-ajusta (`01/06`, `02/06`).

## Testing

### Testes automatizados em `tests/social/`

1. **`format-detection.test.ts`**: HTML com `data-social-format` variado → viewport correto.
2. **`theme-merge.test.ts`**: brand config + preset + override → config final esperada.
3. **`render-archetypes.test.ts`**: para cada arquétipo × formato, pipeline completo, valida dimensões do PNG e integridade. Snapshot visual opcional via pixelmatch.
4. **`render-carousel.test.ts`**: carrossel de 5 slides, valida manifest.yaml, valida presença de todos os PNGs em ordem.

### QA manual em `tests/social/MANUAL_QA.md`

Checklist visual rodado no preview.html após mudanças: tracking tokens corretos, safe zones respeitadas, gradient só no accent moment, hierarchy clara.

### Não testado automaticamente

- Qualidade subjetiva do design (humano).
- Reference mode outputs (não determinístico).
- Caption/hashtag suggestions (não determinístico).

### Degradação

- Sem Playwright → erro com comando de setup.
- Sem brand config → defaults do pdf-forge.
- Sem preset referenciado → erro listando disponíveis.

## O que NÃO muda

- Core design rules do pdf-forge (tracking tokens, zinc backbone, spacing geométrico, content ratio) permanecem default para `slides` e `docs`.
- Brand config file (`.claude/pdf-forge.local.md`) permanece no mesmo caminho.
- Setup (`scripts/setup.ts`) e merge pipeline (`scripts/merge-pages.ts`) — merge só roda pra docs/slides.
- CLI entrypoint: `bun run scripts/render-pdf.ts` segue funcionando para os três formatos.

## Roadmap pós-MVP

1. **Publish skill separada** — integração com Graph API do Instagram, Buffer, Later, consumindo `manifest.yaml`.
2. **Script `extract-palette.ts`** — extração determinística de paleta via color quantization.
3. **Mais themes empacotados** conforme uso real demandar.
4. **Preview web vivo** (hot reload) — dev server opcional para iterar sem rebuild.
5. **Integração com claude-mem** — search de posts anteriores, "refaz aquele post do mês passado mas com dados novos".

## Métrica de sucesso

Design considerado bem-sucedido se:

1. Usuário consegue gerar um carrossel completo (5 slides, formato 4:5, com dados e CTA) em um único briefing de prosa livre, produzindo 5 PNGs + manifest.yaml prontos para upload.
2. Reference Mode com uma imagem de referência produz um post que preserva a gramática visual perceptivelmente (paleta, densidade, hierarquia tipográfica próximas), validado por comparação lado-a-lado.
3. Zero regressão nos outputs existentes (slides e docs) — todos os testes atuais continuam passando.
4. SKILL.md atualizada permanece navegável (não mais de ~400 linhas, com tabela de índice).
