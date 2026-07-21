// S3 avatar storage (work-plan: profile pictures). Two responsibilities:
//   1. DEFAULT_AVATAR_URL — the grey silhouette every new user starts with,
//      served from the public-read bucket (uploaded once to defaults/avatar.png).
//   2. presignPutUrl() — mint a short-lived, single-object PUT URL so the browser
//      uploads its chosen image straight to S3. The bytes never touch this server;
//      we only ever handle the tiny URL, and the object becomes publicly readable
//      via the bucket policy (uploads still require this signature).
//
// All config is read from env (set on Render + local .env), never hardcoded, so
// no bucket name or key leaks into source. When S3 isn't configured the presign
// path fails cleanly (see isConfigured) and signup still defaults the avatar to
// whatever DEFAULT_AVATAR_URL is set to (or null).
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const REGION = process.env.AWS_REGION
const BUCKET = process.env.S3_AVATAR_BUCKET

// The default profile picture. Set DEFAULT_AVATAR_URL in the deploy env to the
// public URL of the silhouette you uploaded; falls back to null so a missing
// config never crashes signup (the client then shows its own default).
export const DEFAULT_AVATAR_URL = process.env.DEFAULT_AVATAR_URL || null

// Only build a client when both the region and bucket are present — otherwise
// the SDK would throw at construction time and take down the whole process on
// import. A null client makes isConfigured() false and presignPutUrl() 503.
const client = REGION && BUCKET ? new S3Client({ region: REGION }) : null

/** True when uploads can be signed (region + bucket + credentials in env). */
export function isConfigured() {
  return !!client
}

// Which image types a user may upload, mapped to the extension we store under.
const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export function isAllowedContentType(type) {
  return Object.prototype.hasOwnProperty.call(EXT_BY_TYPE, type)
}

/**
 * Mint a presigned PUT URL for a user's image upload. The object key is
 * namespaced per folder + user (`:folder/:userId/:stamp.ext`) so uploads don't
 * collide across users or features and the newest one wins. `folder` defaults to
 * 'avatars' so the original avatar call site is unchanged; social media passes
 * 'posts' / 'stories'. Returns { uploadUrl, publicUrl, key }:
 *   - uploadUrl: PUT the raw file bytes here with the same Content-Type (expires).
 *   - publicUrl: the stable https URL to store on the row + render in <img>.
 * `stamp` is passed in (Date.now() is unavailable in some execution contexts and
 * the caller already has a request clock) to keep keys unique.
 */
export async function presignPutUrl({ userId, contentType, stamp, folder = 'avatars' }) {
  if (!client) throw new Error('S3 is not configured')
  const ext = EXT_BY_TYPE[contentType]
  if (!ext) throw new Error(`Unsupported content type: ${contentType}`)

  const key = `${folder}/${userId}/${stamp}.${ext}`
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  })
  // 5 minutes is plenty for a single small image and limits the window a leaked
  // URL could be reused.
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 })
  const publicUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`
  return { uploadUrl, publicUrl, key }
}

// The public-URL prefix for this bucket, used to validate that a save-avatar
// request points at our own bucket rather than an arbitrary external URL.
export function bucketPublicPrefix() {
  if (!BUCKET || !REGION) return null
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/`
}

/**
 * Upload raw bytes to S3 from the server. Used when the file originates on the
 * backend (e.g. AI-generated flyers coming back from OpenAI) — no presigned
 * round-trip needed. Returns the public URL. Follows the same key convention
 * as presignPutUrl (folder/userId/stamp.ext) so both paths share layout.
 */
export async function putObject({ userId, contentType, stamp, folder, body }) {
  if (!client) throw new Error('S3 is not configured')
  const ext = EXT_BY_TYPE[contentType]
  if (!ext) throw new Error(`Unsupported content type: ${contentType}`)

  const key = `${folder}/${userId}/${stamp}.${ext}`
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
  const publicUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`
  return { publicUrl, key }
}
