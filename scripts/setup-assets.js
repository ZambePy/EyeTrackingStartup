// Setup de assets offline — copia WASM do MediaPipe e baixa face_landmarker.task
// Execute: npm run setup
// Necessário apenas UMA VEZ após npm install ou quando modelos mudarem.

const fs    = require('fs')
const path  = require('path')
const https = require('https')

const ROOT   = path.join(__dirname, '..')
const PUBLIC = path.join(ROOT, 'public')

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    entry.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d)
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const request = https.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close(() => {
          if (fs.existsSync(dest)) fs.unlinkSync(dest)
          downloadFile(res.headers.location, dest).then(resolve).catch(reject)
        })
        return
      }
      if (res.statusCode !== 200) {
        file.close(() => {
          if (fs.existsSync(dest)) fs.unlinkSync(dest)
          reject(new Error(`HTTP ${res.statusCode} ao baixar ${url}`))
        })
        return
      }
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
    })
    request.on('error', err => {
      if (fs.existsSync(dest)) fs.unlinkSync(dest)
      reject(err)
    })
  })
}

async function main() {
  // 1. Copia WASM do MediaPipe (node_modules → public/mediapipe/wasm/)
  const wasmSrc  = path.join(ROOT, 'node_modules/@mediapipe/tasks-vision/wasm')
  const wasmDest = path.join(PUBLIC, 'mediapipe/wasm')

  if (!fs.existsSync(wasmSrc)) {
    console.error('[setup] ERRO: node_modules/@mediapipe/tasks-vision não encontrado.')
    console.error('        Execute: npm install')
    process.exit(1)
  }

  console.log('[setup] Copiando MediaPipe WASM...')
  copyDir(wasmSrc, wasmDest)
  const files = fs.readdirSync(wasmDest)
  console.log(`[setup]   -> public/mediapipe/wasm/ (${files.length} arquivos)`)

  // 2. Baixa face_landmarker.task (uma vez, ~28 MB)
  const modelDir  = path.join(PUBLIC, 'models')
  const modelDest = path.join(modelDir, 'face_landmarker.task')

  if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true })

  if (fs.existsSync(modelDest)) {
    const size = fs.statSync(modelDest).size
    if (size > 1_000_000) {
      console.log(`[setup] face_landmarker.task já existe (${(size / 1024 / 1024).toFixed(1)} MB), pulando.`)
      console.log('[setup] Setup concluído!')
      return
    }
    fs.unlinkSync(modelDest)
  }

  const MODEL_URL =
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

  console.log('[setup] Baixando face_landmarker.task (necessário apenas uma vez)...')
  console.log(`[setup]   Origem: ${MODEL_URL}`)

  try {
    await downloadFile(MODEL_URL, modelDest)
    const size = fs.statSync(modelDest).size
    console.log(`[setup]   -> public/models/face_landmarker.task (${(size / 1024 / 1024).toFixed(1)} MB)`)
    console.log('[setup] Setup concluído! O app agora funciona 100% offline.')
  } catch (err) {
    console.error('[setup] Falha ao baixar modelo:', err.message)
    console.error('[setup] Execute "npm run setup" novamente quando tiver internet.')
    process.exit(1)
  }
}

main()
