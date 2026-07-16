# IrisFlow — Plano de Sprints: Interface & Electron
**Versão 1.0 · Julho 2026**

---

## 0. Contexto e Premissas de Design

O **IrisFlow** é um produto AAC (Comunicação Aumentativa e Alternativa) para pessoas com ELA em estágio avançado. O usuário opera o sistema inteiramente pelo olhar — dwell (fixação) e blink intencional. O cuidador é responsável pela configuração inicial e manutenção. O produto roda **100% local via Electron**, sem dependência de internet após instalação.

### Dois Usuários, Uma Interface

| Perfil | Modo de Operação | Requisito Chave |
|--------|-----------------|-----------------|
| **Usuário com ELA** | Navega APENAS pelo olhar. Nunca toca no mouse ou teclado. | Alvos mínimos de 80×80px. Feedback visual imediato em toda interação. |
| **Cuidador** | Configura perfil, ajusta parâmetros, gerencia frases. Usa mouse normalmente. | A interface deve deixar claro quais áreas são do cuidador. |

### Restrições Inegociáveis

- Todo elemento navegável pelo olhar deve ter classe `.dwell-target` e tamanho mínimo de **80×80px**.
- Nenhuma ação irreversível (apagar perfil, resetar calibração) pode ser disparada por dwell/blink acidental — exige **confirmação com cooldown de 2s**.
- Contraste mínimo **WCAG AA** em todos os textos. Fonte mínima de 18px para o cuidador; **24px+** para elementos do usuário.
- Todas as telas devem funcionar **offline**. Zero chamadas de rede em runtime.
- O cursor de olhar (ponto verde) deve aparecer em **TODAS** as telas, nunca oculto.

### Stack Electron

- **Main process (Node.js):** gerencia janela, IPC, arquivos de perfil, assets do MediaPipe/ONNX.
- **Renderer process (Vite + TypeScript):** toda a UI — reutiliza o código das Sprints 1–4 diretamente.
- **Preload:** expõe APIs seguras via `contextBridge` (`saveProfile`, `loadProfile`, `savePhrase`, `loadPhrases`, `exportLog`, `getAppVersion`).

---

## 1. Arquitetura de Telas

### Modo Usuário *(operado pelo olhar)*

| Tela | Descrição |
|------|-----------|
| **Home** | Ponto de entrada após login/seleção de perfil |
| **Teclado Virtual** | Comunicação livre por digitação |
| **Frases Rápidas** | Comunicação por frases pré-definidas |

### Modo Cuidador *(operado por mouse)*

| Tela | Descrição |
|------|-----------|
| **Calibração** | Processo guiado de calibração ocular |
| **Perfil** | Gestão de usuários e dados |
| **Configurações** | Parâmetros do sistema, câmera, filtros |
| **Frases & Favoritas** | Gerenciamento de frases pré-definidas |

### Navegação

- **Usuário:** botão flutuante "Menu" sempre visível no canto inferior direito (`.dwell-target` 100×100px). Abre overlay de navegação com 3–4 destinos grandes.
- **Cuidador:** barra lateral colapsável, acessível via ícone de cadeado/engrenagem, desativada durante sessão ativa do usuário para evitar interferência.

---

## ~~Sprint UI-1 — Fundação Electron + Shell de Navegação~~ ✅ CONCLUÍDA — 2026-07-15
> **Prioridade: CRÍTICA** | **Depende de:** —

**Objetivo:** transformar o projeto Vite atual em aplicação Electron funcional com navegação entre telas, sem quebrar nenhuma funcionalidade das Sprints 1–4 de precisão.

### 1.1 — Configuração Electron

- Criar `electron/main.ts` com BrowserWindow (1280×800 mínimo, sem frame nativo, fundo `#0D0D0D`).
- Criar `electron/preload.ts` expondo via `contextBridge`: `saveProfile`, `loadProfile`, `savePhrase`, `loadPhrases`, `exportLog`, `getAppVersion`.
- Adaptar `vite.config.ts` para gerar bundle do renderer compatível com Electron (`target: "electron-renderer"`, sem `"type":"module"` no `package.json` do electron).
- Empacotar assets estáticos do MediaPipe (`face_landmarker.task` e wasm) localmente em `resources/` — **eliminar dependência de CDN** (jsdelivr/googleapis), que hoje impede uso offline real.
- Scripts: `npm run electron:dev` (Vite dev server + Electron em paralelo) e `npm run electron:build` (Vite build + electron-builder).

### 1.2 — Shell de Navegação

- Criar `src/shell/Router.ts`: gerenciador de rotas SPA sem dependência de framework. Cada "rota" é um componente que monta/desmonta no `#app-root`.
- Rotas iniciais: `home`, `keyboard`, `quick-phrases`, `calibration`, `profile`, `settings`, `phrases`.
- Criar `src/shell/NavOverlay.ts`: overlay de navegação do usuário (fundo semitransparente, 4 botões grandes `.dwell-target` de 120×120px com ícone + label).
- Criar `src/shell/CaregiverNav.ts`: sidebar colapsável para o cuidador (largura 220px, colapsada 48px), com links para as telas de configuração.
- O cursor de olhar (ponto verde atual do `main.ts`) deve ser elevado para o shell e renderizado acima de todas as telas via `z-index`.

### 1.3 — Migração do main.ts Atual

- Extrair o loop de câmera/MediaPipe para `src/gaze/GazeEngine.ts` — singleton que roda independente da tela ativa.
- `GazeEngine` emite eventos: `gazeMove(x,y)`, `blink(intentional)`, `calibrationComplete`, `lowConfidence`.
- Cada tela se inscreve nos eventos que precisa via `GazeEngine.on(...)` e cancela ao desmontar.

### Gate de Aceitação

- [ ] `npm run electron:dev` abre a janela sem erros no console.
- [ ] `npm run electron:build` gera instalador funcional que roda **offline** (sem internet, sem CDN).
- [ ] Navegação entre pelo menos 2 telas funciona pelo olhar (dwell 800ms).
- [ ] FPS permanece ≥25 após migração para GazeEngine.

---

## ~~Sprint UI-2 — Tela Home~~ ✅ CONCLUÍDA — 2026-07-16
> **Prioridade: ALTA** | **Depende de:** UI-1

**Objetivo:** tela de entrada que o usuário vê ao abrir o sistema. Deve orientar o estado atual e dar acesso rápido às duas funções principais.

### Layout

Fundo escuro (`#0D0D0D`) → Logo IrisFlow centralizado no topo → Dois botões grandes centralizados → Status do sistema no rodapé → Botão "Menu Cuidador" no canto superior direito (ícone de cadeado, **não** é dwell-target — requer mouse).

### Tarefas

- Criar `src/screens/HomeScreen.ts` com montagem/desmontagem limpa.
- Dois botões `.dwell-target` **200×200px**: ícone grande (SVG) + label abaixo. Ícone de teclado para Teclado Virtual; ícone de balão para Frases Rápidas.
- Barra de status no rodapé (altura 48px): câmera (verde/vermelho) · calibrado (verde/amarelo) · nome do perfil ativo · FPS discreto.
- Se **NÃO calibrado**: banner de alerta não-bloqueante no topo ("Calibração necessária — peça ao cuidador") — não é dwell-target.
- Se **câmera não detectada**: tela de erro com instrução clara para o cuidador.
- Animação de entrada suave (fade 200ms) ao montar a tela.

### Gate de Aceitação

- [x] Usuário consegue navegar de Home → Teclado e Home → Frases Rápidas usando apenas o olhar.
- [x] Status de câmera e calibração refletem o estado real em tempo real.
- [x] Banner de "não calibrado" aparece e desaparece corretamente.

---

## ~~Sprint UI-3 — Tela de Calibração *(fluxo do cuidador)*~~ ✅ CONCLUÍDA — 2026-07-15
> **Prioridade: ALTA** | **Depende de:** UI-1

**Objetivo:** redesenhar o fluxo de calibração atual (hoje embutido no `main.ts`) como tela dedicada, com UX clara para o cuidador guiar o usuário.

### Tarefas

- Criar `src/screens/CalibrationScreen.ts` que encapsula toda a lógica de `calibration.ts`.
- **Fase 1 — Instruções:** tela preta com texto grande ("Peça ao usuário para olhar para o ponto"). Botão [Iniciar Calibração] operado pelo cuidador (mouse).
- **Fase 2 — Pontos:** interface atual de bolinha animada, sem modificações na lógica. Progresso visual (ex: "4/9 pontos").
- **Fase 3 — Resultado:** exibir relatório de acurácia da Sprint 1 (acurácia, precisão RMS, classificação). Botões [Aceitar e Continuar] / [Recalibrar] — ambos operados pelo cuidador.
- **Recalibração expressa inter-sessão** (Sprint 4): ao detectar drift, exibir banner na Home com botão [Recalibração Rápida (5 pontos)] — operado pelo cuidador.
- **Persistência:** ao aceitar, salvar perfil via IPC (`preload.saveProfile`) em vez de `localStorage` — dados ficam em arquivo local do sistema.

### Gate de Aceitação

- [ ] Fluxo completo cuidador → calibração → resultado → continuar funciona sem erros.
- [ ] Perfil salvo persiste após fechar e reabrir o Electron.
- [ ] Recalibração expressa oferece os 5 pontos e atualiza o perfil.

---

## ~~Sprint UI-4 — Tela de Teclado Virtual~~ ✅ CONCLUÍDA — 2026-07-15
> **Prioridade: ALTA** | **Depende de:** UI-1, UI-2

**Objetivo:** tela principal de comunicação livre. Usuário digita pelo olhar; texto acumula em área de saída com síntese de voz opcional.

### Layout

```
┌─────────────────────────────────────────┐
│  Área de texto (~25% da tela, 28px)     │
├─────────────────────────────────────────┤
│  Sugestões de palavras (3 botões)       │
├─────────────────────────────────────────┤
│                                         │
│         Teclado QWERTY (75%)            │
│                                         │
├──────────────────────────────────┬──────┤
│  [🔊 Falar] [🗑 Limpar] [📋 Copiar] │ ☰  │
└──────────────────────────────────┴──────┘
```

### Tarefas

- Migrar teclado virtual atual (`src/keyboard/`) para `src/screens/KeyboardScreen.ts` com montagem/desmontagem limpa.
- Área de texto: exibe o texto digitado com cursor piscante. Fonte 28px, alto contraste. Scroll automático para a última linha.
- Teclas `.dwell-target` mínimo **72×72px** (teclado QWERTY cabe em 1280px com esse tamanho). Destacar tecla sob o olhar com borda ciano e progress ring de dwell.
- Teclas especiais: `ESPAÇO` (largura dupla), `APAGAR`, `ENTER`, `MAIÚSCULA`, `NÚMEROS/SÍMBOLOS`. Cada uma com ícone claro além do label.
- Barra de ação com 3 botões `.dwell-target`: [🔊 Falar] (TTS via Electron shell ou Web Speech API), [🗑 Limpar] (com confirmação de 2s), [📋 Copiar].
- **Predição de palavras:** linha de 3 sugestões acima do teclado (dicionário local PT-BR). *(Opcional nesta sprint — backlog se não couber.)*
- **Persistência de sessão:** ao sair da tela, salvar o texto atual para restaurar se o usuário voltar.

### Gate de Aceitação

- [ ] Usuário digita frase de 10 palavras usando apenas o olhar em menos de **3 minutos**.
- [ ] [Falar] produz saída de áudio com o texto atual.
- [ ] [Apagar] com confirmação de 2s não dispara acidentalmente.
- [ ] Teclas de 72×72px sem sobreposição visual.

---

## ~~Sprint UI-5 — Tela de Frases Rápidas & Favoritas~~ ✅ CONCLUÍDA — 2026-07-15
> **Prioridade: ALTA** | **Depende de:** UI-1, UI-2

**Objetivo:** comunicação rápida por frases pré-definidas organizadas em categorias. É o modo principal para usuários com ELA avançada que já têm necessidades comunicativas previsíveis.

### Layout

Grade de categorias → Ao selecionar: grade de frases → Frase selecionada aparece na área de texto com opção [Falar] imediato.

### Tarefas

- Criar `src/screens/QuickPhrasesScreen.ts`.
- Grade de categorias: máximo 6 categorias visíveis, botões `.dwell-target` **180×120px** com ícone + nome.
- Ao selecionar categoria: transição suave (slide 200ms) para grade de frases. Máximo 6 frases por tela; paginação por [←] [→] se houver mais.
- Cada frase: botão `.dwell-target` **560×80px**, texto centralizado 22px. Ao selecionar: exibe frase em destaque + [🔊 Falar imediatamente] + [✩ Favoritar].
- **Categoria "Favoritas":** frases marcadas com ✩ pelo usuário ou cuidador. Sempre a primeira categoria.
- **Frases padrão PT-BR** incluídas no instalador (~40 frases em 5 categorias): Necessidades básicas, Sentimentos, Perguntas, Desconforto/Dor, Família.
- **Persistência:** frases e favoritos salvos via IPC em arquivo local JSON.

### Gate de Aceitação

- [ ] Usuário acessa frase em no máximo **3 dwell-selections** (categoria → frase → falar).
- [ ] Favoritos persistem entre sessões.
- [ ] Frases padrão PT-BR carregam no primeiro uso.

---

## ~~Sprint UI-6 — Tela de Perfil *(cuidador)*~~ ✅ CONCLUÍDA — 2026-07-16
> **Prioridade: MÉDIA** | **Depende de:** UI-1

**Objetivo:** gestão de perfis de usuário. Um dispositivo pode ter múltiplos perfis (diferentes pacientes ou configurações de câmera).

### Tarefas

- Criar `src/screens/ProfileScreen.ts` — acessível apenas pelo cuidador via sidebar.
- Lista de perfis: nome, foto opcional, data da última calibração, status (calibrado/não calibrado).
- Botão [+ Novo Perfil]: formulário com nome, câmera preferida, notas do cuidador.
- Selecionar perfil: carrega calibração, frases e configurações daquele usuário.
- **Exportar perfil:** gera arquivo `.irisflow` (ZIP com calibração + frases + config) via IPC — backup ou transferência entre dispositivos.
- **Importar perfil:** abre seletor de arquivo `.irisflow` e restaura o perfil.
- **Excluir perfil:** requer digitação do nome como confirmação (operação irreversível, mouse only).
- Dados armazenados em arquivos locais (`%APPDATA%/IrisFlow/profiles/<id>/`) via IPC — **não** no `localStorage`.

### Gate de Aceitação

- [x] Criar, selecionar e excluir perfil funciona sem erros.
- [x] Export/import de `.irisflow` preserva calibração e frases.
- [x] Múltiplos perfis coexistem sem interferência.

---

## ~~Sprint UI-7 — Tela de Configurações *(cuidador)*~~ ✅ CONCLUÍDA — 2026-07-16
> **Prioridade: MÉDIA** | **Depende de:** UI-1

**Objetivo:** painel de controle para o cuidador ajustar todos os parâmetros do sistema sem precisar tocar no código.

### Seção: Câmera

- Seletor de dispositivo de câmera (lista de câmeras detectadas pelo sistema).
- Seletor de resolução (720p / 1080p / automático).
- Preview ao vivo da câmera com overlay de landmarks (para verificar detecção).
- Botão [Testar Detecção]: roda 5s e reporta % de frames com rosto detectado.

### Seção: Filtro OneEuroFilter

- Sliders para `mincutoff` (0.1–2.0) e `beta` (0.001–0.05) — migrar das Sprints 1–2.
- Preview ao vivo: cursor de olhar reage imediatamente ao ajuste dos sliders.

### Seção: Dwell & Blink

- Tempo de dwell padrão (300ms–2000ms, step 100ms).
- Raio de dwell (20–80px).
- Frames mínimos para blink intencional (2–8 frames).
- Toggle: blink ativo / desativado (para usuários que não conseguem piscar voluntariamente).

### Seção: Acessibilidade

- Tamanho do cursor de olhar (pequeno / médio / grande).
- Cor do cursor (ciano padrão / branco / amarelo — para diferentes condições de iluminação).
- Fator de zoom da interface (100% / 125% / 150%) via CSS transform.
- Velocidade de Text-to-Speech (0.5× – 2×) e seleção de voz PT-BR.

### Seção: Sistema

- Versão do IrisFlow e data do build.
- Botão [Exportar Log de Sessão] — aciona o log da Sprint 1.
- Botão [Diagnóstico de Acurácia] — abre o teste de acurácia da Sprint 1.
- Toggle: iniciar automaticamente com o Windows/macOS.

### Gate de Aceitação

- [x] Todas as configurações persistem entre sessões (arquivo local via IPC).
- [x] Mudança de câmera reconecta o stream **sem reiniciar** o Electron.
- [x] Sliders de filtro atualizam o cursor em tempo real.

---

## ~~Sprint UI-8 — Gerenciamento de Frases *(cuidador)*~~ ✅ CONCLUÍDA — 2026-07-16
> **Prioridade: MÉDIA** | **Depende de:** UI-5, UI-6

**Objetivo:** interface para o cuidador criar, editar, organizar e importar frases. É o back-office das Frases Rápidas da Sprint UI-5.

### Tarefas

- Criar `src/screens/PhrasesScreen.ts` — acessível apenas pelo cuidador via sidebar.
- Lista de categorias com contagem de frases. Botões [+ Nova Categoria], [Renomear] e [Excluir] por categoria.
- Ao selecionar categoria: lista de frases com [Editar] / [Excluir] / [⬆ ⬇ Reordenar] por frase.
- [+ Nova Frase]: campo de texto livre (mouse/teclado), campo de categoria, toggle Favorita.
- [Editar Frase]: mesmo formulário, pré-preenchido.
- **Importar frases:** aceita `.txt` (uma frase por linha) ou `.csv` (coluna frase, coluna categoria). Importação em lote com preview antes de confirmar.
- **Exportar frases:** gera `.csv` com todas as frases e categorias.
- Botão [Restaurar frases padrão PT-BR] — adiciona as frases padrão **sem apagar** as customizadas.

### Gate de Aceitação

- [x] Cuidador cria categoria + 5 frases em menos de **3 minutos**.
- [x] Frases aparecem imediatamente na tela de Frases Rápidas após salvar.
- [x] Import de `.txt` com 20 frases funciona sem erros.

---

## ~~Sprint UI-9 — Polimento, Acessibilidade e Instalador Final~~ ✅ CONCLUÍDA — 2026-07-16
> **Prioridade: ALTA** | **Depende de:** todas

**Objetivo:** sprint de qualidade antes do primeiro release. Sem novas features — apenas polimento, testes e empacotamento.

### Polimento Visual

- Revisar consistência visual em todas as 7 telas: espaçamentos, tamanhos de fonte, cores de estado (ativo/hover/dwell/selecionado).
- Progress ring de dwell consistente em **TODOS** os `.dwell-targets`.
- Animações de transição entre telas (fade 200ms) uniformes.
- Ícones SVG consistentes — criar `src/assets/icons.ts` com exportação centralizada.

### Acessibilidade

- Verificar contraste WCAG AA em todas as telas (ferramenta: `axe-core` no renderer).
- Todos os `.dwell-targets` com `aria-label` descritivo.
- `prefers-reduced-motion`: desligar animações de transição.
- Modo alto contraste: toggle nas Configurações que eleva contraste para **WCAG AAA**.

### Instalador

- `electron-builder` configurado para gerar: NSIS installer (Windows), `.dmg` (macOS), `.AppImage` (Linux).
- Ícone do app em todos os tamanhos (256×256, 512×512, 1024×1024).
- Auto-updater (`electron-updater`) configurado para verificar releases no GitHub — **desativado por padrão**, ativável nas configurações.
- Assets do MediaPipe e ONNX empacotados — instalador funciona **100% offline** após instalação.

### Testes de Campo

- Sessão de teste com pelo menos 1 usuário sem ELA simulando cabeça estática: 30 minutos de uso contínuo, todas as telas.
- Checklist: câmera detectada · calibração concluída · digitação de frase · frases rápidas · configurações salvas · perfil exportado/importado.

### Gate de Aceitação

- [x] Instalador funciona em máquina limpa **sem internet**.
- [ ] 30 minutos de uso sem crash ou congelamento. *(teste de campo — validação manual)*
- [x] Zero erros no console do Electron em uso normal.
- [ ] Checklist de verificação 100% verde. *(teste de campo — validação manual)*

---

## Resumo das Sprints

| Sprint | Entregável | Depende de | Prioridade |
|--------|-----------|-----------|-----------|
| ~~**UI-1**~~ ✅ | Electron + shell de navegação + GazeEngine | — | ~~CRÍTICA~~ CONCLUÍDA |
| ~~**UI-2**~~ ✅ | Tela Home | UI-1 | ~~ALTA~~ CONCLUÍDA |
| ~~**UI-3**~~ ✅ | Tela Calibração | UI-1 | ~~ALTA~~ CONCLUÍDA |
| ~~**UI-4**~~ ✅ | Teclado Virtual | UI-1, UI-2 | ~~ALTA~~ CONCLUÍDA |
| ~~**UI-5**~~ ✅ | Frases Rápidas & Favoritas | UI-1, UI-2 | ALTA |
| ~~**UI-6**~~ ✅ | Perfil (cuidador) | UI-1 | ~~MÉDIA~~ CONCLUÍDA |
| ~~**UI-7**~~ ✅ | Configurações (cuidador) | UI-1 | ~~MÉDIA~~ CONCLUÍDA |
| ~~**UI-8**~~ ✅ | Gerenciamento de Frases | UI-5, UI-6 | ~~MÉDIA~~ CONCLUÍDA |
| ~~**UI-9**~~ ✅ | Polimento + instalador final | todas | ~~ALTA~~ CONCLUÍDA |

> **UI-1 é o pré-requisito de tudo.**
> UI-2, UI-3, UI-4 e UI-5 podem ser desenvolvidas em paralelo após UI-1 concluída.
> UI-6, UI-7 e UI-8 são do cuidador e podem ser desenvolvidas em paralelo com UI-4 e UI-5.
> A nova webcam IR (1080p/60fps) deve ser testada assim que chegar — rodar o instrumento de acurácia da Sprint 1 antes e depois e documentar o delta.

---

*IrisFlow · Documento interno · Não distribuir*
