// Persist auto-tag results to the EventTag table. Split from autotag.js so
// the tagger itself stays a pure function (easy to test, no DB). This module
// is the "write side" — one call to replace all AI/system tags on an event.

import prisma from '../lib/prisma.js'
import { autotagEvent } from './autotag.js'

/**
 * Run the tagger and persist the results as EventTag rows for the given event.
 *
 * Idempotent: on each call we DELETE the event's existing AI/system tags and
 * re-insert. Organizer-typed tags (source='organizer') are left untouched — a
 * re-tag never destroys human input.
 *
 * Runs inside the caller's Prisma transaction if `tx` is provided; otherwise
 * uses the shared prisma client. Callers on the write path (POST /events,
 * PATCH /events/:id when the title/description changed) should pass `tx` so
 * the tag write is atomic with the event create/update.
 *
 * Category fallback: the DB stores categoryId (UUID), but the tagger needs
 * the category slug. When `event.categoryId` is provided we resolve it to the
 * slug via a single lookup on the same client (works inside a transaction).
 *
 * @param {object} args
 * @param {string} args.eventId  UUID of the event to tag
 * @param {object} args.event    { title, description, isFree, priceMin, categoryId?, categorySlug?, organizerTags? }
 * @param {import('@prisma/client').Prisma.TransactionClient} [args.tx]
 * @returns {Promise<{ tagWrites: object[], written: number }>}
 */
export async function tagAndPersist({ eventId, event, tx }) {
  const client = tx ?? prisma

  // Resolve categoryId → slug for the fallback tag. Skip the round-trip when
  // the caller already knows the slug (preview endpoint) or when neither was
  // provided (older callers).
  let categorySlug = event.categorySlug ?? null
  if (!categorySlug && event.categoryId) {
    const row = await client.category.findUnique({
      where: { id: event.categoryId },
      select: { slug: true },
    })
    categorySlug = row?.slug ?? null
  }

  const result = autotagEvent({ ...event, categorySlug })

  // Drop stale AI/system tags. Organizer tags survive.
  await client.eventTag.deleteMany({
    where: { eventId, source: { in: ['ai', 'system'] } },
  })

  if (result.tagWrites.length === 0) {
    return { tagWrites: [], written: 0 }
  }

  // createMany is cheaper than N creates and the @@unique([eventId, slug])
  // constraint would only fire if the caller passed dup slugs — the tagger
  // dedupes upstream, so skipDuplicates is a belt-and-braces safeguard.
  await client.eventTag.createMany({
    data: result.tagWrites.map((t) => ({
      eventId,
      slug: t.slug,
      label: t.label,
      source: t.source,
      confidence: t.confidence,
    })),
    skipDuplicates: true,
  })

  return { tagWrites: result.tagWrites, written: result.tagWrites.length }
}
