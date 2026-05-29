# EZJobApplier — Redesign Frontend

**Data:** 2026-05-29  
**Status:** Aprovado

## Visão Geral

Reconstrução completa do frontend SvelteKit do zero. A aplicação gerencia candidaturas automatizadas a vagas no LinkedIn. Interface em pt-BR, estilo dark/minimal, substituindo a UI atual por um layout mais consistente e com melhor UX.

## Decisões de Design

| Decisão | Escolha |
|---|---|
| Estilo visual | Dark/minimal — fundo #0d0d0f, bordas sutis, texto zinc |
| Navegação | Sidebar fixa com ícones SVG + texto |
| Abertura de vaga | Drawer deslizante da direita (por cima do conteúdo) |
| Cards do kanban | Ricos: skills, local, tipo de contrato, data, badge de alerta |
| Tabela | Power table com checkboxes e colunas configuráveis |
| Discoveries | Histórico completo de buscas com botão "Repetir" |
| Idioma | pt-BR em toda a UI |

## Layout

```
┌─────────────────────────────────────────────────────┐
│ Sidebar (196px) │ Área principal                     │
│                 │                                     │
│ EZJobApplier    │  [título da seção]   [contadores]  │
│                 │─────────────────────────────────────│
│ ⬛ Pipeline     │                                     │
│ ☰  Tabela       │  <conteúdo da seção ativa>          │
│ 🔍 Discoveries  │                                     │
│ ⚙  Configurações│                                     │
│                 │                          ┌─────────┐│
│ ──────────────  │  (drawer sobre o conteúdo│ Drawer  ││
│ [Auto-apply]    │   quando vaga selecionada│ 320px   ││
│ [Nova descoberta│                          └─────────┘│
└─────────────────┴─────────────────────────────────────┘
```

## Seções

### Pipeline (Kanban)

Colunas por status, scroll horizontal:

| Coluna | Cor | Statuses |
|---|---|---|
| Encontradas | zinc | FOUND |
| Precisa de Resposta | amarelo | NEEDS_INPUT |
| Revisar | azul | READY_FOR_REVIEW |
| Candidatura Externa | roxo | EXTERNAL |
| Enviadas | verde | SUBMITTED |
| Ignoradas / Falhas | muted | SKIPPED, FAILED |

**Card:**
- Linha 1: título (truncado)
- Linha 2: empresa · local · tipo de contrato
- Linha 3: tags de skills
- Rodapé: badge de alerta (ex: "2 sem resposta") + data relativa

### Tabela

- Toolbar: filtro de status, filtro de empresa, busca, botão colunas
- Colunas: checkbox | Vaga (título + skills como subtexto) | Empresa | Local | Status | Data
- Linhas alternadas, hover sutil
- Clique na linha → abre drawer

### Discoveries

- Header com contagem de buscas + botão "Nova busca"
- Lista de itens: provider badge, config resumida (keywords · local · filtros), status, vagas encontradas, data/duração
- Busca ativa: contador em tempo real + botão cancelar
- Buscas passadas: botão "Repetir" (pré-preenche modal com mesmos filtros)
- Modal "Nova busca": formulário com keywords, local, max vagas, tipo de trabalho, data de postagem, nível de experiência, tipo de contrato, Easy Apply toggle

### Configurações

- Toggle: mostrar browser durante automação
- Select: idioma de busca (pt-BR / en-US)
- Seção de currículos: lista de arquivos, currículo padrão, upload

### Drawer (Detalhes da Vaga)

- Desliza da direita (320px), por cima do conteúdo
- Fecha com ✕, Esc ou clique fora
- Header: título, empresa · local, status badge, link externo para LinkedIn
- Abas: **Info** | **Ações**
- **Aba Info:** descrição da vaga, skills, preferências, histórico de Q&A
- **Aba Ações:** conteúdo contextual por status:
  - FOUND → instrução + botão "Abrir formulário"
  - NEEDS_INPUT → formulário com perguntas sem resposta + perguntas já respondidas
  - READY_FOR_REVIEW → formulário de revisão + seletor de currículo
  - EXTERNAL → link externo
  - FAILED → mensagem de erro
  - SUBMITTED / SKIPPED → sem ações
- Rodapé: "Ignorar" (secundário) + ação primária por status

## Paleta de Cores

```
Fundo base:       #0d0d0f
Superfície:       #111113
Superfície alta:  #18181b
Sidebar:          #0a0a0c
Borda sutil:      #1c1c20
Borda padrão:     #27272a
Texto primário:   #e4e4e7
Texto secundário: #a1a1aa
Texto muted:      #71717a
Texto placeholder:#52525b

Status Found:     fundo #1c1c20, texto #71717a
Status NeedsInput:fundo #2d2508, texto #ca8a04
Status Review:    fundo #1e3a5f, texto #3b82f6
Status External:  fundo #2e1065, texto #a855f7
Status Submitted: fundo #052e16, texto #22c55e
Status Failed:    fundo #1c0a0a, texto #ef4444

Acento (botão primário): #2563eb
Auto-apply ativo: fundo #14532d, texto #86efac
```

## Componentes

- `Sidebar.svelte` — navegação + ações
- `KanbanBoard.svelte` — layout das colunas
- `KanbanColumn.svelte` — coluna individual
- `KanbanCard.svelte` — card rico
- `JobDrawer.svelte` — drawer deslizante com tabs Info/Ações
- `JobTable.svelte` — tabela com toolbar e checkboxes
- `DiscoveriesView.svelte` — histórico de buscas
- `DiscoveryModal.svelte` — formulário de nova busca
- `SettingsView.svelte` — configurações
- `StatusBadge.svelte` — badge de status reutilizável

## Tecnologia

Stack atual mantido: SvelteKit + Svelte 5 (runes), Tailwind CSS v4, Lucide Svelte, TypeScript.

## Fora de Escopo

- Backend: nenhuma alteração
- Autenticação
- Persistência de preferências de colunas (pode vir depois)
