# PSD Import — reconstruir um .psd como deck editável

Converte um Photoshop `.psd` num deck pdf-forge **editável e pixel-fiel**. Não é importação
mágica: o `.psd` vira um **fundo pixel-perfect (placa) + textos editáveis em HTML** por cima.

## Quando usar
O usuário tem um `.psd` (capa, deck, proposta, cartaz, modelo a preencher) e quer:
"transformar esse PSD num design editável", "refazer pixel a pixel", "deixar editável no pdf-forge".

## A ideia (por que funciona)
- O **composite do psd-tools** (com efeitos) é pixel-perfect.
- Para cada artboard geramos duas imagens: a **referência** (com texto) e a **placa**
  (composite com TODOS os textos ocultos = fundo limpo, com fotos/cards/ícones/logos/efeitos).
- Os **textos** viram dados (string + bbox + **cor medida** via diff referência×placa) e são
  re-desenhados como `<div>` editáveis sobre a placa. Resultado: fundo idêntico + texto
  editável/vetorial (trocar nome de cliente, números, etc.).

## Limites honestos (diga ao usuário)
- **Fonte:** PSDs modernos costumam **não** gravar o `EngineData` → a fonte original é
  irrecuperável. Usamos uma **fonte substituta** (Google Fonts, default Montserrat) calibrada
  por largura (`scaleX`). O texto fica visualmente fiel, não glifo-idêntico. Se o `.psd` tiver
  fontes recuperáveis, o manifest lista em `fonts` (`fonts_recoverable: true`).
- **Conteúdo fotográfico** continua raster (na placa) — não vira vetor editável. Editável = o texto.
- O `psd-to-slides` é um **scaffold**: posição/cor/quebra vêm certas; **peso, alinhamento
  (centralizado em cards) e itálico** precisam de ajuste fino no HTML, conferindo a referência.

## Pré-requisitos
- `uv` no PATH (https://docs.astral.sh/uv/) — as deps Python (psd-tools, aggdraw, scikit-image,
  pillow, numpy) são instaladas sozinhas via PEP 723 em `scripts/psd/extract.py`.
- Chromium do Playwright (`bun run scripts/setup.ts`) para medir/renderizar.

## Fluxo

### One-shot (recomendado)
```bash
# Encadeia extract → slides → render → merge. Detecta o tamanho dos artboards e passa
# --viewport automaticamente quando o deck não é 1920×1080 (cartaz/single-artboard).
bun run scripts/psd-to-deck.ts "modelo.psd" --output ./psd-deck [--font "Montserrat"] [--scale 2] [--assets]
# Saídas: ./psd-deck/extract/ (composite,placas,manifest), ./psd-deck/deck/pages (HTML editável),
#         ./psd-deck/deck.pdf
```

### Passo a passo (controle fino)
```bash
# 1) Extrai: composite, referências por artboard, placas (sem texto), manifest.json
bun run scripts/psd-extract.ts "modelo.psd" --output ./psd-extract [--assets]

# 2) Gera os HTML editáveis (placa + textos calibrados). --font troca a substituta.
bun run scripts/psd-to-slides.ts ./psd-extract --output ./psd-deck --font "Montserrat"

# 3) Render + merge (pipeline normal). Artboards 1920x1080 caem no formato 'slides';
#    para outro tamanho fixo (cartaz), passe --viewport WxH.
bun run scripts/render-pdf.ts ./psd-deck/pages --format slides --output ./psd-deck/rendered [--viewport 1080x1350]
bun run scripts/merge-pages.ts ./psd-deck/rendered --output ./psd-deck/deck.pdf
```

## Saídas do extract (`./psd-extract/`)
- `composite.png` — composite full do documento.
- `slides/<slug>.png` — referência por artboard (com texto) → use para conferir fidelidade.
- `plates/<slug>.png` — placa por artboard (fundo, sem texto) → vira o `<img>` de fundo.
- `manifest.json` — `{ width,height, artboards[], fonts{}, fonts_recoverable, texts{slug:[{...}]} }`.
  Cada texto traz, além de `text,bbox_rel,w,h,color,font`, **métricas medidas da tinta**
  (diff referência×placa, robustas mesmo sem `EngineData`): `cap_height` (altura real do
  glifo), `weight_hint` (peso 400–900 inferido da espessura de traço via distance-transform),
  `align` (`left|center|right` — confiável só em caixas de parágrafo), `ink_bbox_rel`, `ink_w`,
  `stroke_ratio`. O `psd-to-slides` já usa `weight_hint` e `align` no scaffold.
- `assets/<slug>/*.png` — (com `--assets`) cada camada não-texto, se quiser reconstruir cards/ícones em CSS.

## Refino de fidelidade (o agente faz por slide)
O scaffold já chega com **peso medido** (`weight_hint`) e **largura calibrada** (`scaleX`); o
ajuste manual restante é menor. Para cada slide, compare o render com `psd-extract/slides/<slug>.png`:
1. **Peso**: já vem do `weight_hint` (medido). Corrija só se o ghost da borda indicar destoe.
2. **Alinhamento**: `align` é medido, mas labels de card (texto-ponto) costumam sair `left` →
   centralize na mão: `text-align:center; width:<bbox.w>px;` (sem `scaleX`).
3. **Largura** de 1 linha: `transform:scaleX(larguraAlvo/larguraNatural)` (origem `0 0`). Meça com
   um span temporário. Para rótulos “espaçados”, prefira `scaleX`/largura do bbox — **não** use
   `letter-spacing` positivo (o design system só permite tracking negativo via tokens semânticos).
4. **Multi-linha/justificado**: `white-space:normal; width:<bbox.w>px; line-height:~1.25`.
5. **Itálico** onde a referência mostrar.
Itere render → diff visual até casar. O "fantasma" fino de borda de letra é aceitável (fonte substituta).

## Cartaz / single-artboard (tamanho ≠ 1920×1080)
Sem artboards, o documento inteiro vira 1 "artboard". O HTML sai no tamanho nativo e o render
respeita via **`--format slides --viewport WxH`** (override do viewport 1920×1080). O one-shot
**`psd:deck` detecta o tamanho e passa `--viewport` sozinho** quando o deck é uniforme e ≠ 1920×1080.
`--scale` melhora a nitidez do PNG *antes* do merge; o `merge-pages` ainda normaliza a aresta
longa para **1440px**, então o PDF final não é “impressão em alta resolução” — é aspect-correct
em resolução de deck.
