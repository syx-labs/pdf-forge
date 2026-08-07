---
name: yorus-commercial-proposals
description: Build Yorus commercial proposal PDFs. Use for Yorus/Estancorp-style proposals.
version: 0.1.0
author: Hermes
metadata:
  hermes:
    tags: [Yorus, PDF, Proposal, Design]
---

# Yorus Commercial Proposals

## When to Use
- Creating, critiquing, or rebuilding a **Yorus commercial proposal** PDF/deck.
- User references Estancorp/Projeto Thiago proposal style, “proposta comercial”, “aprovação”, “começar segunda”, AI-SDR/commercial-intelligence offers, or asks to “aprender” from the Estancorp PDF.
- Pair with `openclaw-imports/pdf-forge` and `ocr-and-documents`.

## Reference Artifact
- Prefer a local Estancorp/Yorus proposal PDF the user attaches (or an optional local cache if available). Do **not** hardcode machine-specific absolute paths.
- Extracted facts from the canonical reference: A4, 9 pages, Safari/Quartz export, fonts include Archivo, Newsreader, IBM Plex Mono, SF/SFNS; palette is Yorus black/white/orange.

## Core Principle
Turn the proposal into a **decision artifact**, not a pretty document. A director should answer in under 60 seconds: what is being approved, why now, proof it works, risks controlled, cost, go-live timing, and exact next action.

## Canonical Page Arc
1. **Cover / value promise** — specific promise + hero proof number. Example: “Do protótipo validado à operação comercial segura” + “120 reuniões”.
2. **A decisão** — one-page executive approval summary: proof, recurring price, setup, MVP timing, risk controls.
3. **Contexto** — quantified problem + why scale is the real blocker.
4. **Produto** — two-layer model: diagnostic panel + activation/copilot layer, sitting over existing CRM/data.
5. **Produto na tela** — directional mockups showing what the user sees and decides.
6. **Arquitetura & segurança** — trust-boundary: what crosses, what does not cross, why the director can approve.
7. **Protótipo × produto** — risk/current-state vs governed operating-state, not a neutral feature table.
8. **Investimento & implantação** — price anchored against human cost + phased timeline.
9. **Próximo passo** — dark approval checklist with exact actions.

## Visual Grammar
- Zinc backbone (~90% zinc shades) with white/off-white surfaces; orange is the single accent moment. Allow exactly one controlled accent gradient on the hero element per page — no additional gradients. Avoid robots, neural networks, and stock-business imagery.
- Typography: Archivo-like sans for structure/body, Newsreader-like serif for selective editorial emphasis, IBM Plex Mono-like labels. Do not overuse tracked all-caps; use it only as a system label.
- One focal point per page: hero proof number, mockup, boundary diagram, price anchor, or approval checklist.
- Prefer asymmetric editorial layouts and structured tables over equal card grids. No three consecutive pages with the same pattern.
- Use black/dark full-page or large dark blocks only for decisive moments: cover rail, validated number, final approval checklist.

## Copy Rules
- Lead with client-specific proof and named operational reality, not generic “AI transformation”.
- Frame as “validated prototype → governed operation”. This preserves the client’s idea while selling production maturity.
- Make security a condition for approval, not a feature: PII masked, retention zero, RBAC, audit, cost ceiling.
- Use concrete, calm urgency: “Aprovado hoje, começamos segunda.” Avoid fake scarcity.
- Price by value: “Toda a operação pelo custo de meio analista”, “≈ R$ 133 por gerente/mês”, then setup/monthly.

## Directional Mockup Rules
- Always include at least one mockup when selling productized automation. It proves daily use.
- Mockup should show **decision moments**, not decoration: greeting, account metrics, next action, suggested text, human review, “sem PII no modelo”.
- Use plausible fictional data with client vocabulary. Avoid lorem ipsum and real sensitive data.
- Keep density readable: 5–6 information blocks max per mockup; labels must explain value.
- Make it clearly “mockup direcional” if not production UI, to avoid overpromising.

## Pricing & Terms Pattern
- Start with value anchor before price.
- Separate setup (implantation/structure/MVP) from monthly (operation/support/evolution/AI/infrastructure).
- Show included capacity with headroom vs estimated usage; show excedente rules and alert threshold.
- Put “sem fidelidade” and cancellation/notice terms visibly; it reduces perceived risk.
- Pair timeline with price: week 1 MVP, weeks 2–4 integration/refinement, later modules.

## Final Approval Checklist Template
Use a dark page titled “Para aprovar e começar.” Keep 5 binary actions:
1. Aprovar setup.
2. Aprovar mensalidade.
3. Confirmar responsável operacional do cliente.
4. Liberar materiais/dados/protótipo/documentos.
5. Definir data de início e primeiro marco visível.

## Verification
Before delivering a Yorus proposal:
- Extract/check key facts and arithmetic with tools.
- Render to PDF, then render back to PNG/contact sheet.
- QA: no overflow/cuts/blank pages; price readable in 2 seconds; final checklist has owners/action/timing; security page makes “PII does not cross” obvious.
- Final response must include PDF path, editable source path, renderer used, page count, and QA evidence.
