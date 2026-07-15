import crypto from 'crypto'

// `@xenova/transformers` is deliberately NOT imported at module load. It pulls
// in the onnxruntime native addon, whose initialization segfaults on some hosts
// (e.g. Render's shared instances) — crashing the whole process at startup
// (exit 139 / SIGSEGV), before any embedding is even requested. We now:
//   1. load transformers lazily, only when an embedding is actually generated;
//   2. let a deployment disable embeddings entirely via EMBEDDINGS_ENABLED=false.
// See getEmbedder() below.
const EMBEDDINGS_ENABLED = process.env.EMBEDDINGS_ENABLED !== 'false'

const MODEL = 'Xenova/all-MiniLM-L6-v2'
const VECTOR_DIM = 384

let embedder = null
let embedderFailed = false

async function getEmbedder() {
  if (!EMBEDDINGS_ENABLED) {
    throw new Error('Embeddings are disabled in this environment (EMBEDDINGS_ENABLED=false)')
  }
  if (embedderFailed) {
    throw new Error(
      `Embedding model "${MODEL}" is not available. Run the spike script to download it: node backend/scripts/embed.js`,
    )
  }
  if (!embedder) {
    try {
      // Dynamic import: the native onnxruntime addon loads here, on first use,
      // NOT at process startup.
      const { pipeline: transformersPipeline, env } = await import('@xenova/transformers')
      env.allowLocalModels = true
      env.allowRemoteModels = true
      embedder = await transformersPipeline('feature-extraction', MODEL)
    } catch (err) {
      embedderFailed = true
      throw new Error(`Failed to load embedding model "${MODEL}": ${err.message}`)
    }
  }
  return embedder
}

export function composeEventText(event) {
  const parts = [event.title]

  if (event.category?.name) {
    parts.push(event.category.name)
  }

  if (event.tags?.length) {
    const sorted = [...event.tags]
      .sort((a, b) => Number(b.confidence ?? 0) - Number(a.confidence ?? 0))
      .slice(0, 8)
    parts.push(sorted.map((t) => t.label).join(', '))
  }

  if (event.venueName) parts.push(event.venueName)
  if (event.city) parts.push(event.city)

  if (event.description) {
    parts.push(event.description.slice(0, 500))
  }

  if (event.isSports && event.sportsDetail) {
    parts.push(event.sportsDetail.sport)
    parts.push(event.sportsDetail.skillLevel.replace('_', ' '))
  }

  return parts.join(' · ')
}

export function computeContentHash(text) {
  return crypto.createHash('sha256').update(`${text}||${MODEL}`).digest('hex')
}

export async function generateEmbedding(text) {
  const embed = await getEmbedder()
  const output = await embed(text, { pooling: 'mean', normalize: true })
  return Array.from(output.data)
}

export { MODEL, VECTOR_DIM }
