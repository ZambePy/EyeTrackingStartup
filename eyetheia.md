# IrisFlow × EyeTheia — Roadmap de Sprints

**Objetivo geral:** integrar o pipeline técnico do [EyeTheia](https://github.com/patherstevenson/EyeTheia) (do funcionamento zero até o rastreamento ocular em tempo real, usando os modelos pré-treinados para fins acadêmicos) na plataforma IrisFlow, e mapear/construir a interface Electron acessível para usuários com ELA, inspirada no Grid 3 e no Tobii Communicator/TD Snap.

**Documento preparado para ser consumido sprint a sprint pelo Claude Code.** Cada sprint tem: objetivo, contexto técnico, tarefas, entregáveis e *gate* (critério de aceite que decide se avança).

---

## 0. Resumo do pipeline EyeTheia (extraído do código-fonte real)

Antes das sprints, o que o EyeTheia realmente é, com base na leitura do repositório:

```
Navegador (cliente)                       Servidor Python (FastAPI)
┌──────────────────────────┐              ┌─────────────────────────────────┐
│ Webcam (getUserMedia)    │              │ GazeTracker (PyTorch)           │
│ MediaPipe FaceMesh       │  WS binário  │  ├─ extract_features():         │
│  → 468 landmarks         │ ───────────▶ │  │   crops face/olho E/olho D   │
│ Frame JPEG + landmarks   │  (JPEG+JSON) │  │   (224×224) + face grid 25×25│
│                          │              │  │   normalização por imagem     │
│ ONNX Runtime Web         │ ◀─────────── │  │   média (.mat)               │
│  (inferência local pós-  │  {x_px,y_px} │  ├─ GazeModel (iTracker CNN)    │
│   calibração)            │              │  │   4 ramos → (x, y) na tela   │
└──────────────────────────┘              │  ├─ One Euro Filter (x e y)     │
                                          │  │   freq=30, mincutoff=1.5,    │
                                          │  │   beta=0.02                  │
                                          │  └─ Calibration → fine-tuning   │
                                          │      Adam, MSE, lr=1e-4,        │
                                          │      10 épocas, batch=4         │
                                          │  Export ONNX por usuário        │
                                          │  (opset 18) via rotas /onnx     │
                                          └─────────────────────────────────┘
```

Componentes-chave do repositório:

| Módulo | Função |
|---|---|
| `src/tracker/GazeTracker.py` | Orquestra tudo: carrega checkpoint, extrai features via landmarks, prediz, filtra (One Euro) |
| `src/tracker/GazeModel.py` | Arquitetura iTracker (Krafka et al. 2016): CNN compartilhada para os olhos, CNN da face, MLP do face grid, cabeça FC → (x,y). Há também `EyeTheiaUFModel` com cabeça de incerteza (logvar) |
| `src/tracker/Calibration.py` | Calibração 5/9/13 pontos **por clique de mouse**; coleta (features, alvo) e dispara fine-tuning |
| `src/models/` | `itracker_baseline.tar` (pré-treino GazeCapture/mobile) e `itracker_mpiiface.tar` (treinado em MPIIFaceGaze/desktop) |
| `src/mat/` | Imagens médias para normalização (dependem do checkpoint escolhido) |
| `src/routes/ws_model.py` | WebSocket de predição em tempo real, buffer "latest-only" (descarta frames velhos) |
| `src/routes/ws_calibration.py` | WebSocket de calibração incremental (imagem base64 + landmarks + coordenada alvo) |
| `src/routes/onnx.py` | Exporta o modelo personalizado pós-calibração para ONNX e serve para o cliente rodar com ONNX Runtime Web |
| `src/utils/OneEuroTuner.py` | Utilitário para ajustar parâmetros do filtro One Euro |
| `Makefile` | `make mpii` / `make baseline` sobem o servidor com o checkpoint escolhido |

**Requisitos:** Python com PyTorch 2.6 (CUDA opcional — roda em CPU), mediapipe 0.10.21, FastAPI/uvicorn, onnx/onnxruntime, oneeurofilter.

### ⚠️ Avisos formais (registrar no repositório do IrisFlow)

1. **Licença GPLv3.** Qualquer código do EyeTheia incorporado ao IrisFlow contamina o projeto com copyleft. Para pesquisa acadêmica não há problema; para o produto comercial futuro, a integração deve ser isolada (ex.: sidecar/serviço separado comunicando por rede) e a decisão jurídica registrada.
2. **Pesos pré-treinados.** `itracker_baseline` deriva do GazeCapture e `itracker_mpiiface` do MPIIFaceGaze — ambos datasets com licença de uso em pesquisa/não comercial. Uso acadêmico ok; uso comercial exigirá retreino com dados próprios (que é exatamente o plano com os dados da universidade).
3. **Anonimização.** Nos testes com pessoas, frames de webcam são dado biométrico sensível (LGPD): armazenar apenas features/landmarks quando possível, com consentimento.

---

## Visão das fases

| Fase | Sprints | Tema |
|---|---|---|
| Fase D — Diagnóstico | D1–D3 | Reproduzir o EyeTheia do zero, medir baseline, auditar compatibilidade com o stack IrisFlow/Electron |
| Fase E — Pipeline | E1–E6 | Integração completa: sidecar Python, ponte Electron, calibração adaptada para ELA, ONNX no renderer, seleção por olhar |
| Fase U — Interface | U1–U9 | Mapeamento e construção de cada aba/ação da UI inspirada em Grid 3 / Tobii |
| Fase V — Validação | V1–V2 | Métricas com usuários, robustez e empacotamento final |

Regra geral de *gate*: nenhuma sprint da fase seguinte começa sem o gate anterior aprovado. Onde houver comparação com o pipeline atual (ridge regression), manter o ridge como fallback comutável por flag até o gate V1 — lição aprendida do A/B do Sprint 5.

---

# FASE D — Sprints diagnósticas

## Sprint D1 — Reprodução do EyeTheia do zero ("funcionamento 0")

**Objetivo:** rodar o EyeTheia intacto, sem nenhuma modificação, na máquina de desenvolvimento, e documentar cada passo até ver o ponto de gaze na tela.

**Tarefas**
1. Clonar o repositório e criar venv Python 3.11+ dedicado (`eyetheia-env`), isolado do restante do IrisFlow.
2. `make lib` (atenção: instala PyTorch cu124; em máquina sem GPU NVIDIA, trocar pelo wheel CPU — documentar o comando exato usado).
3. Subir o servidor com cada checkpoint: `make mpii` e `make baseline`. Registrar tempo de boot, uso de RAM e se caiu em CPU ou CUDA.
4. Executar o fluxo desktop local (`make run` / `src/main.py`): visualização ao vivo, calibração de 13 pontos por clique, fine-tuning, predição pós-calibração.
5. Executar o fluxo cliente-servidor: cliente web → WS `/ws_calibration` e `/ws_model`; depois export ONNX via rotas `/onnx` e inferência no navegador com ONNX Runtime Web.
6. Escrever `docs/eyetheia-repro.md` com: comandos, versões, problemas encontrados, screenshots, e o mapa de mensagens dos dois WebSockets (já documentado nos docstrings de `ws_model.py` e `ws_calibration.py` — validar na prática).

**Entregáveis:** `docs/eyetheia-repro.md`; venv reprodutível (`requirements.lock`); vídeo curto de tela mostrando gaze funcionando pré e pós-calibração.

**Gate D1:** os dois checkpoints rodam; calibração de 13 pontos completa termina o fine-tuning em < 3 min em CPU; export ONNX gera arquivo válido carregável no navegador. Se fine-tuning em CPU passar de 3 min, registrar tempo real e decidir entre reduzir épocas ou exigir GPU no requisito mínimo.

---

## Sprint D2 — Benchmark: EyeTheia pré-treinado vs. pipeline ridge atual do IrisFlow

**Objetivo:** medir com instrumento honesto (sem o bug de frames-zero contando como acerto perfeito, corrigido no G3) se o EyeTheia justifica a integração.

**Tarefas**
1. Definir protocolo fixo de avaliação: mesma webcam (usar a IR 1080p/60fps nova), mesma iluminação, mesmo usuário, grade de 3×3 alvos de validação **distintos** dos pontos de calibração.
2. Medir para ambos os pipelines: erro médio em px e em graus visuais, erro por região da tela (cantos vs. centro — relevante pelo histórico G7 de compressão de cantos), latência ponta-a-ponta (frame capturado → predição na tela), FPS sustentado, taxa de frames sem predição.
3. Cenários: (a) cabeça estática, (b) micro-movimentos de cabeça (simulando restrição de mobilidade da ELA), (c) óculos, (d) iluminação lateral.
4. Comparar 3 condições do EyeTheia: `mpiiface` sem calibração, `mpiiface` + fine-tuning 13 pontos, `baseline` + fine-tuning.
5. Relatório `docs/benchmark-d2.md` com tabelas e decisão recomendada.

**Entregáveis:** script de benchmark reutilizável (será usado de novo no gate V1); relatório.

**Gate D2 (decisão de rota):**
- EyeTheia calibrado ≥ 20% melhor em erro médio que o ridge atual, com latência ≤ 100 ms → seguir integração completa (Fase E inteira).
- Resultado equivalente → integrar mesmo assim para fins acadêmicos, mas manter ridge como default e EyeTheia atrás de flag.
- EyeTheia pior mesmo calibrado → parar, investigar (normalização das médias? resolução da câmera? distância?) antes de qualquer integração. Não repetir o erro do Sprint 5 de integrar antes de validar.

---

## Sprint D3 — Auditoria de compatibilidade com o stack IrisFlow + Electron

**Objetivo:** decidir a arquitetura de integração antes de escrever código de produção.

**Questões a responder (cada uma vira uma seção do relatório):**
1. **Landmarks:** IrisFlow usa MediaPipe **Tasks Vision Face Landmarker** (TS); EyeTheia usa MediaPipe **FaceMesh** (Python) e recebe landmarks do cliente no WS. Os índices dos 468/478 pontos são compatíveis? (Tasks Vision adiciona íris = 478.) Mapear exatamente quais índices `LEFT_EYE`, `RIGHT_EYE`, `FACE_OVAL` de `utils.py` esperam, e validar que os landmarks do Tasks Vision servem sem retraduzir.
2. **Sidecar Python no Electron:** estratégia de empacotamento (PyInstaller vs. python embutido vs. exigir instalação). Tamanho estimado do bundle com PyTorch CPU (~800 MB+) — avaliar se o fine-tuning pode migrar para `onnxruntime-training` ou se PyTorch fica só na fase de calibração.
3. **Dois modos de operação:** (a) modo calibração → precisa do sidecar (PyTorch) rodando; (b) modo uso diário → só ONNX Runtime Web no renderer, **sem Python**. Confirmar que o `.onnx` exportado com opset 18 roda no ORT Web com backend WASM (e medir se WebGL/WebGPU acelera).
4. **Threading/latência no renderer:** ORT Web + MediaPipe no mesmo processo — rodar inferência em Web Worker? Medir.
5. **Licenciamento:** desenho da fronteira GPLv3 (sidecar como processo separado com protocolo de rede documentado).

**Entregáveis:** `docs/arquitetura-integracao.md` com diagrama final da arquitetura escolhida e ADRs (Architecture Decision Records) para os pontos 1–5.

**Gate D3:** arquitetura aprovada por Gabriel; prova de conceito mínima do ponto 3 (um `.onnx` do EyeTheia rodando dentro de uma janela Electron com input sintético).

---

# FASE E — Integração do pipeline

## Sprint E1 — Sidecar EyeTheia gerenciado pelo Electron

**Objetivo:** o app Electron sobe, monitora e derruba o servidor FastAPI do EyeTheia como processo filho.

**Tarefas**
1. Módulo `main/sidecar.ts`: spawn do servidor (`run_server.py --model_path itracker_mpiiface.tar`), porta dinâmica livre, health-check (`GET /config` ou rota equivalente), restart com backoff, kill no `app.quit`.
2. Logs do sidecar canalizados para o log do Electron com prefixo.
3. Tela de estado no app: "motor de rastreamento: iniciando / pronto / erro" (será reaproveitada na UI final, aba Monitor).
4. Configuração da resolução de tela real: o `config.py` do EyeTheia fixa 1920×1080 — enviar dimensões reais do display via rota/handshake `screen` do WS em vez de depender da constante.
5. Empacotamento dev: script que ativa o venv correto; empacotamento prod fica para V2.

**Gate E1:** abrir o app → sidecar pronto em < 15 s; fechar o app → nenhum processo Python órfão; matar o sidecar manualmente → app detecta e reinicia.

---

## Sprint E2 — Captura no renderer e protocolo WebSocket binário

**Objetivo:** o renderer do IrisFlow envia frames + landmarks no formato exato que o `ws_model.py` espera e recebe `{x_px, y_px}` em tempo real.

**Tarefas**
1. Reusar a captura existente do IrisFlow (getUserMedia + Tasks Vision Face Landmarker) e adaptar a saída de landmarks ao formato `list[dict]` esperado pelo `unpack_ws_message` (validar contra `utils/ws_codec.py`).
2. Encoder do frame para JPEG (OffscreenCanvas, qualidade configurável — começar em 0.7) e montagem do payload binário `meta JSON + bytes`.
3. Handshake `{"type": "screen", "w", "h"}` com dimensões reais.
4. Loop de envio com política *latest-only* também no cliente (não enfileirar frames se o servidor está atrasado — espelha o design do servidor).
5. Overlay de debug: ponto bruto vs. ponto filtrado, FPS de envio, FPS de resposta, RTT.

**Gate E2:** ponto de gaze (não calibrado, impreciso é aceitável) seguindo o olhar a ≥ 20 predições/s com a webcam IR a 60 fps; RTT p95 < 80 ms local.

---

## Sprint E3 — Calibração adaptada para ELA (crítico)

**Objetivo:** substituir a calibração por clique de mouse do EyeTheia por fluxos viáveis para o contexto ELA, mantendo o protocolo `ws_calibration` intacto no servidor.

**Contexto:** no EyeTheia, o participante clica em cada ponto. Usuário com ELA não clica. Dois fluxos:

1. **Fluxo cuidador-assistido (default):** o cuidador conduz. O alvo aparece animado (encolhendo, como no Grid 3), o usuário só olha; a captura do sample é disparada automaticamente após janela de estabilização (ex.: 800 ms de landmarks estáveis + N frames coletados), ou pelo cuidador via tecla/botão. Feedback sonoro a cada ponto.
2. **Fluxo temporizado autônomo:** sequência automática com contagem regressiva por ponto, pausável por piscada longa (reusar o detector de piscada pós-correção G1).

**Tarefas**
1. Tela de calibração no renderer: 5/9/13 pontos (mesmas posições geradas por `get_numbered_calibration_points` — replicar a geometria para consistência com o modelo), animação de alvo, sequenciamento, repetição de ponto ruim.
2. Cliente do WS `/ws_calibration`: `calib_start` → para cada ponto, capturar M frames válidos (começar com M=5) e enviar `calib_point` (imagem base64 + landmarks + alvo); tratar `ack`, `progress` (estágios `reset_model`, `training`, `after_eval`) e `result`.
3. Critério de qualidade de sample no cliente: descartar frames com olhos fechados, landmarks instáveis ou face fora do enquadramento; refazer o ponto se < M válidos.
4. Tela de progresso do fine-tuning ("personalizando o rastreamento…") consumindo os eventos `progress`.
5. Validação pós-calibração embutida: 4 alvos de teste, erro médio exibido ao cuidador com semáforo (verde < 2°, amarelo < 3.5°, vermelho ≥ 3.5° → sugerir recalibrar).

**Gate E3:** calibração completa de 9 pontos conduzida por cuidador em < 4 min incluindo fine-tuning; validação pós-calibração exibida; nenhum clique exigido do usuário final.

---

## Sprint E4 — Export ONNX e inferência local no renderer (modo uso diário)

**Objetivo:** após calibrar, o app baixa o `.onnx` personalizado e passa a rodar 100% no renderer, sem sidecar — o modo que o produto usará no dia a dia offline.

**Tarefas**
1. Cliente das rotas `/onnx`: disparar export pós-calibração, poll de status, download do modelo + metadata (shapes, nomes de inputs, preprocessing) e cache local por perfil de usuário (`userData/profiles/<id>/model.onnx`).
2. Reimplementar `extract_features` em TypeScript: crops de face/olhos 224×224 a partir dos landmarks do Tasks Vision, face grid 25×25, subtração das imagens médias (converter os `.mat` para tensores JSON/binários no build — corresponder ao checkpoint usado, conforme metadata).
3. Sessão ORT Web em Web Worker; backend WASM com fallback, testar WebGPU.
4. Paridade: harness que roda o mesmo frame gravado no sidecar (PyTorch) e no renderer (ONNX) e compara saídas — divergência máxima tolerada 1 px.
5. Chaveamento de modos: Calibração (sidecar ligado) ↔ Uso (sidecar desligado). Sidecar só é iniciado quando necessário.
6. Portar o One Euro Filter para TS com os mesmos parâmetros (freq 30, mincutoff 1.5, beta 0.02) e expor os parâmetros nas configurações (o `OneEuroTuner.py` serve de referência para a tela de ajuste do cuidador).

**Gate E4:** teste de paridade passa; modo uso diário roda sem nenhum processo Python ativo, ≥ 25 predições/s, CPU do renderer < 60% na máquina alvo.

---

## Sprint E5 — Camada de seleção por olhar (dwell, piscada, fixação)

**Objetivo:** transformar coordenadas de gaze em ações de UI confiáveis — o coração do AAC.

**Tarefas**
1. Detector de fixação (I-DT ou I-VT sobre o sinal já filtrado): estado `fixando(elemento, t)`.
2. **Dwell-to-select** configurável (default 800 ms; faixa 300–3000 ms), com anel de progresso visual no elemento (padrão Grid 3) e som de confirmação.
3. **Piscada intencional** como seleção alternativa (reusar o detector do G1; piscada longa > 500 ms = selecionar, para não disparar em piscadas naturais).
4. Anti-Midas-touch: zona de descanso (olhar fora dos alvos não seleciona nada), cooldown pós-seleção, exigência de sair-e-voltar para reselecionar o mesmo alvo.
5. Hit-testing com margem de erro adaptativa: o raio efetivo do alvo cresce conforme o erro medido na validação pós-calibração (alvo lógico > alvo visual).
6. API de eventos para a UI: `gazeenter`, `gazeleave`, `dwellprogress`, `select` — a Fase U inteira consome só essa API, nunca coordenadas cruas.

**Gate E5:** em grade 3×3 de botões, ≥ 95% de seleções corretas e < 1 seleção involuntária por minuto em teste de 10 min com membro da equipe; dwell ajustável em tempo real.

---

## Sprint E6 — Robustez do pipeline

**Objetivo:** o rastreamento sobrevive ao mundo real antes de a UI ser construída em cima.

**Tarefas**
1. Perda de face/landmarks: estado `tracking lost` com aviso discreto e congelamento do cursor (nunca pular para posição aleatória); recuperação automática.
2. Drift ao longo da sessão: recalibração rápida de 1 ponto ("olhe para o centro") acessível pelo cuidador; medir drift em sessão de 30 min.
3. Mudança de condição: detecção de queda de qualidade (variância dos landmarks, luminância) com sugestão de recalibrar.
4. Persistência por perfil: modelo ONNX, parâmetros de filtro, dwell, resultados de validação — tudo em `userData/profiles/<id>/`.
5. Suíte de regressão com vídeos gravados (fixtures) rodando no CI: nenhuma mudança futura de UI pode quebrar o pipeline sem o CI acusar.

**Gate E6:** sessão contínua de 30 min sem crash, sem vazamento de memória (heap estável), drift < 1° adicional; fixtures no CI verdes.

---

# FASE U — Interface Grid 3 / Tobii (mapeamento aba a aba)

Princípios herdados do Grid 3 e do Tobii Communicator, aplicados a todas as sprints U:

- **Duas personas:** *Usuário* (opera 100% por olhar, nunca precisa de precisão fina) e *Cuidador* (configura com mouse/teclado; área protegida).
- Células grandes de alto contraste, grade configurável (2×2 até 6×8), símbolo + texto por célula.
- Toda ação do usuário responde à API do E5 (`select` etc.), nunca a cliques.
- Barra de mensagem persistente no topo (compor → falar), como no Grid 3.
- Saída de voz: TTS pt-BR local (avaliar Web Speech API offline no Electron vs. Piper TTS embarcado — decidir em U3).

## Sprint U1 — Shell da aplicação e navegação global

**Escopo/abas:** estrutura de janelas do app.
1. **Home do usuário:** grade inicial de page sets (Comunicação, Frases rápidas, Teclado, Alertas, Entretenimento*). (*placeholder)
2. **Barra de sistema por olhar:** voltar, home, chamar cuidador, pausar rastreamento (célula "olho fechado" que suspende seleção — anti-fadiga).
3. **Modo cuidador:** acesso por atalho de teclado/botão físico + PIN; nunca acessível só por olhar (evita entrada acidental).
4. Roteamento entre page sets com transições instantâneas (sem animação longa — latência percebida importa mais que estética).
5. Modo kiosk/fullscreen, bloqueio de atalhos do sistema, autostart opcional.

**Gate U1:** navegar Home → page set → voltar → Home só com o olhar; entrar e sair do modo cuidador; pausar/retomar rastreamento por olhar.

## Sprint U2 — Grade de comunicação (núcleo AAC)

1. Modelo de dados de page set: JSON versionado (`pageset.schema.json`) — páginas, células (símbolo, rótulo, ação, cor, destino), herança de estilo.
2. Ações de célula: falar texto, inserir na barra de mensagem, navegar para página, voltar, limpar, apagar última palavra.
3. Vocabulário inicial pt-BR: núcleo (eu, você, quero, não, sim, dor, banheiro, água, obrigado…) organizado em categorias — validar com Giulia/Marcus e, se possível, com fonoaudiólogo parceiro.
4. Barra de mensagem: acumula células, botão Falar (TTS), botão Limpar, repetir última frase.
5. Símbolos: usar conjunto aberto (ARASAAC, licença CC BY-NC-SA — adequado ao uso acadêmico; registrar a atribuição).

**Gate U2:** compor e falar "eu quero água" só com o olhar, em < 20 s, com dwell de 800 ms.

## Sprint U3 — Teclado por olhar + predição

1. Layout ABC e QWERTY grandes, alternáveis; teclas mínimas de 120×120 px lógicos com margem adaptativa (E5).
2. Predição de palavras pt-BR (dicionário de frequência local + aprendizado das palavras do usuário) em 3–5 células de sugestão.
3. Abreviações expansíveis (ex.: "bd" → "bom dia") configuráveis pelo cuidador.
4. Decisão e implementação do TTS definitivo (teste cego entre Web Speech offline e Piper; critérios: naturalidade pt-BR, latência, tamanho).
5. Frase digitada integra a mesma barra de mensagem do U2.

**Gate U3:** digitar uma frase de 5 palavras com predição em < 90 s só com o olhar; TTS falando offline.

## Sprint U4 — Frases rápidas e alertas

1. Page set "Frases rápidas": respostas de 1 olhar (sim/não/depois/não sei) sempre nas mesmas posições (memória muscular ocular).
2. **Aba Alertas/Emergência:** célula de alarme sonoro alto para chamar o cuidador — acessível de qualquer tela em ≤ 2 seleções; célula "dor" com escala corporal (apontar região por olhar).
3. Histórico de frases faladas (revisitar e repetir).
4. Agenda simples de frases por contexto/horário (ex.: manhã → higiene) configurada pelo cuidador.

**Gate U4:** de qualquer tela, disparar o alarme em ≤ 2 seleções; teste com som audível de outro cômodo.

## Sprint U5 — Fluxo de calibração na UI final

1. Integrar a calibração do E3 como experiência polida: onboarding ilustrado para o cuidador (posicionamento da câmera IR, distância 50–70 cm, altura dos olhos, luz).
2. Preview de enquadramento com guias (oval de face, indicadores verde/vermelho por condição: face detectada, olhos visíveis, iluminação).
3. Escolha 5/9/13 pontos com recomendação automática (primeira vez → 13; recalibração → 5).
4. Tela de resultado com semáforo de qualidade (E3.5) e botões "usar assim" / "recalibrar" / "ajustar câmera".
5. Recalibração rápida de 1 ponto acessível na barra do cuidador.

**Gate U5:** cuidador leigo (alguém fora da equipe) completa a primeira calibração sem ajuda verbal, só seguindo o onboarding.

## Sprint U6 — Painel do cuidador: configurações

Abas do painel (protegido por PIN):
1. **Seleção:** dwell time (slider com teste ao vivo), método (dwell/piscada/ambos), cooldown, tamanho da margem adaptativa.
2. **Rastreamento:** parâmetros do One Euro (apresentados como "estabilidade × velocidade", não como beta/mincutoff), perfil da câmera, recalibrar.
3. **Aparência:** tamanho da grade, tema de alto contraste, tamanho de fonte, símbolos on/off.
4. **Voz:** voz TTS, velocidade, volume, teste.
5. **Perfis:** criar/duplicar/exportar/importar perfil de usuário (inclui modelo ONNX calibrado + page sets + configurações — arquivo único `.irisflow`).

**Gate U6:** alterar dwell e estabilidade com efeito imediato observável; exportar um perfil numa máquina e importá-lo em outra restaurando tudo (inclusive calibração).

## Sprint U7 — Editor de grades (cuidador)

1. Editor visual de page sets: adicionar/editar/remover células, arrastar posição, escolher símbolo (busca no catálogo ARASAAC local), definir ação e destino.
2. Duplicar página, reordenar, pré-visualizar como usuário.
3. Validação do schema ao salvar; versionamento com undo simples.
4. Biblioteca de templates prontos (comunicação básica, hospital, família).

**Gate U7:** cuidador cria uma página nova com 6 células funcionais em < 10 min e o usuário a utiliza por olhar imediatamente.

## Sprint U8 — Monitor de rastreamento e diagnóstico

1. Aba do cuidador com telemetria ao vivo: FPS, confiança dos landmarks, estado do pipeline (E6), erro estimado da última validação, heatmap de gaze opcional da sessão.
2. Log de eventos exportável (sem imagens — só métricas; LGPD).
3. Botões de diagnóstico: reiniciar motor, reprocessar câmera, teste de latência.
4. Indicadores discretos na tela do usuário: pontinho de status (verde/amarelo/vermelho) no canto.

**Gate U8:** um problema induzido (cobrir a câmera) aparece no monitor com causa legível e a tela do usuário degrada com elegância (cursor congela + status amarelo).

## Sprint U9 — Acessibilidade fina e fadiga

1. Ajustes anti-fadiga: pausa automática sugerida após N min de uso contínuo; célula de descanso.
2. Suporte a estrabismo/olho dominante: opção de calibrar com um olho só (verificar viabilidade — o iTracker usa os dois ramos; fallback: duplicar o crop do olho válido; marcar como experimento).
3. Alto contraste real (WCAG AAA nos temas), redução de movimento, tamanhos extremos de célula (2×2).
4. Sons opcionais para todos os feedbacks (usuários com visão periférica reduzida).
5. Revisão completa com checklist de acessibilidade + teste com as personas.

**Gate U9:** app 100% operável na grade 2×2 com dwell de 2 s (perfil de baixa precisão), simulando usuário em estágio avançado.

---

# FASE V — Validação e entrega

## Sprint V1 — Estudo de validação acadêmica

1. Rodar o benchmark do D2 novamente no sistema integrado completo (fim-a-fim, com UI) — comparar com os números de D2 para detectar regressão introduzida pela integração.
2. Protocolo com 5–8 participantes saudáveis + (se aprovado eticamente com a universidade) participantes com ELA: tarefa de composição de frases, medir taxa de acerto de seleção, palavras/minuto, NASA-TLX de esforço.
3. Comparação documentada com números publicados do EyeTheia (paper arXiv 2601.06279) e com o baseline ridge — material direto para o artigo/TCC/relatório acadêmico.
4. Registro de consentimento e anonimização (nenhum frame bruto persiste).

**Gate V1:** relatório com métricas; decisão final EyeTheia default vs. ridge default por perfil de máquina.

## Sprint V2 — Empacotamento e distribuição offline

1. Electron-builder: instalador Windows (alvo principal dos cuidadores) com sidecar Python empacotado (PyInstaller, PyTorch CPU) — medir tamanho final; se > 1.5 GB, avaliar instalação do componente de calibração sob demanda.
2. Primeiro uso 100% offline após instalação: modelos pré-treinados embarcados, símbolos locais, TTS local.
3. Assinatura do instalador, atualização manual por arquivo (ambiente sem internet).
4. Documentação de instalação para cuidadores (PDF ilustrado) e README técnico.
5. Checklist final de licenças (GPLv3 do sidecar isolado, ARASAAC, datasets — seção 0).

**Gate V2:** instalação limpa numa máquina nunca usada, sem internet, do zero até o usuário falar uma frase por olhar em < 20 min.

---

## Riscos principais (acompanhar em todas as sprints)

| Risco | Impacto | Mitigação |
|---|---|---|
| Latência do iTracker em CPU fraca | Inviabiliza tempo real | Gate D2 mede cedo; ORT Web WASM/SIMD; manter ridge como fallback por perfil de máquina |
| Incompatibilidade de landmarks FaceMesh × Tasks Vision | Features erradas → predição ruim silenciosa | Sprint D3 item 1 + teste de paridade E4.4 |
| GPLv3 + pesos de pesquisa | Bloqueio comercial futuro | Isolamento em sidecar + plano de retreino com dados próprios da universidade |
| Calibração por clique não portada corretamente | Usuário ELA excluído do fluxo | E3 é sprint dedicada, com gate explícito "nenhum clique do usuário" |
| Fadiga ocular do usuário | Abandono do produto | E5 anti-Midas + U9 anti-fadiga |
| Regressão do pipeline por mudanças de UI | Perda silenciosa de acurácia | Fixtures no CI (E6.5) + re-benchmark V1 |

---

*Documento gerado a partir da análise do código-fonte real do EyeTheia (clone de 17/07/2026) e do contexto atual do IrisFlow. Cada sprint foi desenhada para ser entregue como prompt autônomo ao Claude Code, acompanhada do gate como critério de aceite.*