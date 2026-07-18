# Sprint D1 — Reprodução do EyeTheia: Relatório de Execução

**Data:** 2026-07-17  
**Máquina:** Windows 11 Pro 10.0.26200  
**GPU:** NVIDIA GeForce GTX 1660 Ti (6 GB VRAM)  
**Python:** 3.11.9  
**Repositório clonado em:** `C:\Users\gabri\OneDrive\Desktop\EyeTheia`

---

## 1. Ambiente reprodutível

### Comandos executados

```bash
# 1. Clonar o repositório
git clone https://github.com/patherstevenson/EyeTheia.git C:/Users/gabri/OneDrive/Desktop/EyeTheia

# 2. Criar venv isolado (Python 3.11.9)
python -m venv C:/Users/gabri/OneDrive/Desktop/EyeTheia/eyetheia-env

# 3. Instalar PyTorch com CUDA 12.4 (GPU NVIDIA)
eyetheia-env/Scripts/pip.exe install torch==2.6.0 torchvision==0.21.0+cu124 torchaudio==2.6.0 \
  --index-url https://download.pytorch.org/whl/cu124

# 4. Instalar demais dependências
eyetheia-env/Scripts/pip.exe install -r requirements.txt

# 5. Gerar lock file com versões exatas
eyetheia-env/Scripts/pip.exe freeze > requirements.lock
```

> **CPU sem GPU NVIDIA:** substituir o passo 3 por:
> ```bash
> pip install torch==2.6.0 torchvision==0.21.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu
> ```

### Versões-chave instaladas

| Pacote | Versão |
|---|---|
| torch | 2.6.0+cu124 |
| torchvision | 0.21.0+cu124 |
| mediapipe | 0.10.21 |
| fastapi | 0.115.12 |
| uvicorn | 0.34.0 |
| onnx | 1.20.1 |
| onnxruntime | 1.23.2 |
| oneeurofilter | 0.2.1 |
| scikit-learn | 1.7.0 |

---

## 2. Servidores: boot e portas

Cada checkpoint tem uma porta fixa definida em `run_server.py`:

| Checkpoint | Porta | Comando |
|---|---|---|
| `itracker_mpiiface.tar` | **8002** | `python src/run_server.py --model_path itracker_mpiiface.tar` |
| `itracker_baseline.tar` | **8001** | `python src/run_server.py --model_path itracker_baseline.tar` |

### Tempos de boot medidos (GTX 1660 Ti + CUDA)

| Checkpoint | Boot até responder `/config/gaze_filtered` |
|---|---|
| mpiiface | ~4.2 s |
| baseline | ~1.1 s |

Ambos bem dentro do gate E1 (< 15 s).

### Uso de hardware

- **Device:** CUDA (automático via `torch.device("cuda" if torch.cuda.is_available() else "cpu")`)
- **VRAM total:** 6144 MB  
- **VRAM livre após boot:** ~5128 MB (modelo cabe com folga)
- **RAM sistema:** não medida (psutil não instalado no venv)

### Health check

```bash
curl http://127.0.0.1:8002/config/gaze_filtered
# → {"gaze_filtered": true}
```

---

## 3. Mapa das rotas HTTP

Rotas REST disponíveis (via `/openapi.json`):

| Método | Rota | Descrição |
|---|---|---|
| GET | `/config/gaze_filtered` | Retorna se o One Euro Filter está ativo |
| POST | `/config/set_gaze_filtered` | Liga/desliga o One Euro Filter |
| POST | `/config/update_screen` | Atualiza dimensões da tela (`width`, `height`) |
| POST | `/onnx/export/{client_id}` | Dispara export ONNX pós-calibração (opset padrão: 18) |
| GET | `/onnx/status/{client_id}` | Estado do export ONNX |
| GET | `/onnx/metadata/{client_id}` | Metadados do modelo exportado (shapes, dtype, preprocessing) |
| GET | `/onnx/means/{client_id}` | Tensores de média usados na normalização |
| GET | `/onnx/latest/{client_id}` | Download do arquivo `.onnx` |
| DELETE | `/onnx/{client_id}` | Remove artefatos ONNX do cliente |
| WS | `/ws/predict_gaze` | Predição em tempo real |
| WS | `/ws/calibration` | Calibração incremental |

> ⚠️ **Correção do roadmap:** os endpoints WebSocket são `/ws/predict_gaze` e `/ws/calibration`  
> (o roadmap eyetheia.md os chamava de `/ws_model` e `/ws_calibration` — nomes desatualizados).

---

## 4. Protocolo WebSocket — mapa de mensagens

### Formato binário (ambos os WS)

Arquivo: `src/utils/ws_codec.py`

```
[meta_len: uint32 Big-Endian (4 bytes)] [meta_json: UTF-8] [payload_bytes]
```

Implementação TypeScript para o IrisFlow:
```typescript
function packWsMessage(meta: object, payload: Uint8Array = new Uint8Array(0)): ArrayBuffer {
  const metaBytes = new TextEncoder().encode(JSON.stringify(meta));
  const buf = new ArrayBuffer(4 + metaBytes.length + payload.length);
  const view = new DataView(buf);
  view.setUint32(0, metaBytes.length, false); // Big-Endian
  new Uint8Array(buf, 4, metaBytes.length).set(metaBytes);
  new Uint8Array(buf, 4 + metaBytes.length).set(payload);
  return buf;
}
```

---

### `/ws/predict_gaze`

**Cliente → Servidor (binário):**

| `meta.type` | Campos adicionais | Payload | Descrição |
|---|---|---|---|
| `"screen"` | `w: int, h: int` | — | Informa dimensões reais da tela (enviar antes do primeiro frame) |
| `"frame"` | `landmarks: list[dict]` | JPEG bytes | Frame + landmarks para predição |

**Servidor → Cliente (JSON texto):**

| `type` | Campos | Descrição |
|---|---|---|
| `"screen_ack"` | `w, h` | Confirmação das dimensões |
| `"pred"` | `x_px: float, y_px: float` | Coordenada de gaze em pixels de tela |
| `"error"` | `detail: str` | Erro de processamento |

---

### `/ws/calibration`

**Cliente → Servidor (binário):**

| `meta.type` | Campos adicionais | Payload | Descrição |
|---|---|---|---|
| `"calib_start"` | `screen: {w, h}` | — | Inicia sessão de calibração |
| `"calib_point"` | `i: int, x_pixel: float, y_pixel: float, landmarks: list[dict]` | JPEG bytes (base64 field presente mas payload é binário via codec) | Envia sample de calibração |

**Servidor → Cliente (JSON texto):**

| `type` | Campos | Descrição |
|---|---|---|
| `"ready"` | `expected: 17` | Pronto para receber pontos |
| `"ack"` | `i, count, total` | Confirma recebimento do ponto `i` |
| `"progress"` | `stage: str` | Etapa do fine-tuning |
| `"result"` | `message, total_points` | Calibração concluída |
| `"error"` | `detail: str` | Erro |

**Stages do `progress`:** `reset_model` → `before_eval` → `training` → `after_eval`

> ⚠️ **Correção do roadmap:** o servidor espera exatamente **17 pontos** de calibração (hardcoded em `ws_calibration.py`).  
> O roadmap mencionava 5/9/13 pontos — esses números se referem a configurações da UI do cliente original,  
> mas o servidor só dispara o fine-tuning ao atingir 17 samples acumulados.  
> **Impacto para E3:** a UI de calibração do IrisFlow precisa enviar exatamente 17 samples (podendo repetir pontos se necessário).

---

## 5. Conversão de coordenadas por checkpoint

O servidor aplica conversão diferente dependendo do modelo:

| Checkpoint | Predição bruta | Conversão para pixels |
|---|---|---|
| `itracker_mpiiface.tar` | normalizada MPIIFaceGaze | `denormalized_MPIIFaceGaze(pred_x, pred_y, W, H)` |
| `itracker_baseline.tar` | cm (GazeCapture) | `gaze_cm_to_pixels(pred_x, pred_y, W, H)` |

O mesmo mapeamento inverso é aplicado na calibração (cliente envia pixels, servidor converte para o espaço do modelo).

---

## 6. Parâmetros do One Euro Filter

Configurados em `GazeTracker.__init__`:

```python
OneEuroFilter(freq=30, mincutoff=1.5, beta=0.02, dcutoff=1.0)
```

Corresponde ao que o roadmap documenta. Esses parâmetros são os que o Sprint E4 precisa portar para TypeScript.

---

## 7. Problemas encontrados

| # | Problema | Resolução |
|---|---|---|
| 1 | `python3` não disponível no PATH (Windows) | Usar `python` (3.11.9 disponível) |
| 2 | Servidor baseline sobe na porta 8001, não 8002 | Porta hardcoded por checkpoint — documentado acima |
| 3 | `psutil` não incluído no `requirements.txt` | Não instalado no venv; RAM do servidor não medida automaticamente |
| 4 | Nomes dos WS endpoints divergem do roadmap | Corrigido neste documento |
| 5 | Número de pontos de calibração (17 vs 5/9/13) | Divergência entre UI original e servidor — ver aviso na seção 4 |

---

## 8. Gate D1 — Status

| Critério | Status | Observação |
|---|---|---|
| Checkpoint mpiiface roda | ✅ | Porta 8002, boot ~4.2s |
| Checkpoint baseline roda | ✅ | Porta 8001, boot ~1.1s |
| Fine-tuning < 3 min em CPU | ⏳ Pendente | Requer UI + webcam para testar fluxo completo |
| Export ONNX gera arquivo válido | ⏳ Pendente | Requer calibração prévia (sem dados ainda) |
| venv reprodutível (`requirements.lock`) | ✅ | Gerado em `EyeTheia/requirements.lock` |

Os dois itens pendentes serão validados durante o Sprint E2 (cliente WebSocket) e E3 (calibração na UI).

---

## 9. Próximos passos (Sprint D2)

1. Definir protocolo de benchmark: grade 3×3 separada dos pontos de calibração
2. Medir erro médio em px/graus do pipeline ridge atual do IrisFlow como baseline de comparação
3. Após UI do E2/E3 funcionar, repetir com EyeTheia nos 3 cenários (estático, micro-movimentos, óculos)
