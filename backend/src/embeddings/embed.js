import crypto from 'crypto'

const MODEL = '@cf/baai/bge-small-en-v1.5'
const VECTOR_DIM = 384

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
  const accountId = process.env.CF_ACCOUNT_ID
  const token = process.env.CF_API_TOKEN
  if (!accountId || !token) {
    throw new Error('generateEmbedding requires CF_ACCOUNT_ID and CF_API_TOKEN in the environment')
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `Cloudflare embed failed: ${res.status} ${res.statusText} — ${body.slice(0, 300)}`,
    )
  }

  const json = await res.json()
  if (json.success === false) {
    throw new Error(`Cloudflare embed error: ${JSON.stringify(json.errors ?? json).slice(0, 300)}`)
  }

  const vec = json.result?.data?.[0]
  if (!Array.isArray(vec) || vec.length !== VECTOR_DIM) {
    throw new Error(
      `Cloudflare embed returned unexpected shape (dim=${vec?.length}, expected ${VECTOR_DIM})`,
    )
  }
  return vec
}

export { MODEL, VECTOR_DIM }
