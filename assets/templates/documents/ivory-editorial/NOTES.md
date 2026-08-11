# ivory-editorial — família de templates A4

Família de documento no tema `ivory-editorial` (ver `assets/themes/ivory-editorial.yaml`).
Feita para **material didático e de mentoria/consultoria**: apostilas de aula, guias
passo a passo, playbooks de programa. Off-white quente, serif no display, dois acentos
(pinho frio + terracota quente) usados com parcimônia.

## Anatomia compartilhada

Toda página (exceto a capa) usa o mesmo shell:

- Container: `w-[210mm] min-h-[297mm] bg-ivory relative px-[20mm] pt-[14mm] pb-[24mm] font-sans text-ink`
- **Header corrido**: linha uppercase 8.5px com programa à esquerda e sessão/data à direita, `border-b border-hairline`
- **Label de seção**: uppercase 9px `text-terra font-semibold`
- **Título**: `font-serif font-semibold text-[34px] tracking-heading`
- **Rodapé**: absoluto em `bottom-[12mm]`, título do material à esquerda e número da página à direita, `border-t border-hairline`

Numere os arquivos (`01-cover.html`, `02-...`) e mantenha o número do rodapé em dia —
o merge segue a ordem alfabética dos arquivos renderizados.

## Tokens

Definidos no `tailwind.config` de cada página (mesmos nomes do preset):
`ivory` fundo · `ink` texto · `muted` secundário · `pine` acento frio (termos, links,
perguntas) · `terra` acento quente (labels, numeração) · `hairline` bordas ·
`soft` fill neutro (citações, código) · `sage` fill esverdeado (regras, checklists).

**Tracking:** use somente os quatro tokens semânticos negativos do design system —
`tracking-display` / `tracking-heading` / `tracking-body` / `tracking-label` (-0.01em).
Micro-rótulos uppercase de 8–9px também usam `tracking-label` negativo; nunca
`tracking-wide`/`wider`/`widest` nem letter-spacing positivo.

## Catálogo

| Template | Use para |
|---|---|
| `doc-cover.html` | Capa dois tons com metadados e sumário |
| `content-page.html` | Prosa com barras laterais de ênfase + citação destacada |
| `term-list.html` | Glossário/dicionário: termo + definição + analogia |
| `numbered-steps.html` | Narrativa passo a passo com numeração serif |
| `rule-cards.html` | Regras/princípios em cards numerados |
| `task-page.html` | Tarefa com passo a passo + critério de aceite em 2 colunas |
| `prompt-blocks.html` | Blocos copy-paste em mono (prompts, comandos) |
| `data-table.html` | Tabela editorial + cards de opção |
| `links-page.html` | Referências agrupadas com links clicáveis |
| `faq-page.html` | Perguntas em serif itálico + fechamento assinado |
| `diagram-page.html` | Página de diagrama (SVG mermaid pré-renderizado inline) |

## Diagramas mermaid

O renderer não espera scripts async — mermaid vai **pré-renderizado em SVG estático**:

```bash
bun run scripts/prerender-mermaid.ts scripts/mermaid-manifest.example.yaml --output ./svgs/
```

O manifest de exemplo já traz as `theme_variables` desta paleta. **Gotcha resolvido:**
o script carrega a fonte real (Plus Jakarta Sans) e espera `document.fonts.ready`
ANTES do `mermaid.render` — sem isso o mermaid mede o texto com a fonte default do
Chromium e as caixas saem estreitas, cortando o texto no PDF. Cole o SVG inline no
slot do `diagram-page.html`.

## Render

```bash
bun run scripts/render-pdf.ts ./pages/ --output ./rendered/
qpdf --empty --pages ./rendered/*.pdf -- ./material.pdf   # preserva links clicáveis
```

`merge-pages.ts` funciona, mas descarta as anotações de link dos PDFs (`<a href>`);
para material com links clicáveis, faça o merge final com `qpdf` e confira com
`strings material.pdf | grep -c /URI`.
