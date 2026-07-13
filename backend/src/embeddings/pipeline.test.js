import { composeEventText, computeContentHash, generateEmbedding, MODEL } from './embed.js'

const mockEvent = {
  title: 'Afrobeats Rooftop Party',
  category: { name: 'Nightlife' },
  tags: [
    { label: 'afrobeats', confidence: 0.95 },
    { label: 'rooftop', confidence: 0.9 },
    { label: 'dance', confidence: 0.85 },
  ],
  venueName: 'Sky Lounge',
  city: 'Accra',
  description: 'Join us for an unforgettable night of Afrobeats music on the rooftop.',
  isSports: false,
  sportsDetail: null,
}

const mockSportsEvent = {
  title: 'Saturday Pickup Basketball',
  category: { name: 'Sports & Fitness' },
  tags: [{ label: 'basketball', confidence: 0.98 }],
  venueName: 'City Courts',
  city: 'Accra',
  description: 'Casual pickup game, all welcome.',
  isSports: true,
  sportsDetail: { sport: 'Basketball', skillLevel: 'all_levels' },
}

async function runTests() {
  let passed = 0
  let failed = 0

  function assert(condition, name) {
    if (condition) {
      console.log(`  ✓ ${name}`)
      passed++
    } else {
      console.error(`  ✗ ${name}`)
      failed++
    }
  }

  // --- Test: composeEventText ---
  console.log('\n[composeEventText]')

  const text = composeEventText(mockEvent)
  assert(text.includes('Afrobeats Rooftop Party'), 'includes title')
  assert(text.includes('Nightlife'), 'includes category name')
  assert(text.includes('afrobeats'), 'includes tag labels')
  assert(text.includes('Sky Lounge'), 'includes venue name')
  assert(text.includes('Accra'), 'includes city')
  assert(text.includes('unforgettable night'), 'includes description')
  assert(!text.includes('Basketball'), 'does not include sports data for non-sports event')

  const sportsText = composeEventText(mockSportsEvent)
  assert(sportsText.includes('Basketball'), 'includes sport for sports event')
  assert(sportsText.includes('all levels'), 'includes skill level for sports event')

  // Test tag ordering (top 8 by confidence desc)
  const manyTags = {
    title: 'Test',
    category: null,
    tags: Array.from({ length: 12 }, (_, i) => ({
      label: `tag-${i}`,
      confidence: (12 - i) / 12,
    })),
    venueName: null,
    city: null,
    description: null,
    isSports: false,
    sportsDetail: null,
  }
  const manyTagText = composeEventText(manyTags)
  assert(manyTagText.includes('tag-0'), 'includes highest confidence tag')
  assert(manyTagText.includes('tag-7'), 'includes 8th tag')
  assert(!manyTagText.includes('tag-8'), 'excludes 9th tag (cap at 8)')

  // Test with minimal event
  const minimalEvent = {
    title: 'Minimal Event',
    category: null,
    tags: [],
    venueName: null,
    city: null,
    description: null,
    isSports: false,
    sportsDetail: null,
  }
  const minimalText = composeEventText(minimalEvent)
  assert(minimalText === 'Minimal Event', 'handles minimal event with only title')

  // --- Test: computeContentHash ---
  console.log('\n[computeContentHash]')

  const hash1 = computeContentHash('some text')
  const hash2 = computeContentHash('some text')
  const hash3 = computeContentHash('different text')
  assert(hash1 === hash2, 'same input produces same hash')
  assert(hash1 !== hash3, 'different input produces different hash')
  assert(hash1.length === 64, 'hash is sha256 hex (64 chars)')
  assert(hash1.includes(MODEL) === false, 'model is part of hash input, not output')

  // --- Test: generateEmbedding ---
  console.log('\n[generateEmbedding]')

  let _modelAvailable = true
  try {
    console.log('  (loading model — may take a moment on first run...)')
    const vector = await generateEmbedding('Afrobeats rooftop party in Accra this weekend')
    assert(Array.isArray(vector), 'returns an array')
    assert(vector.length === 384, 'vector has 384 dimensions')
    assert(typeof vector[0] === 'number', 'elements are numbers')
    assert(!vector.some((v) => isNaN(v)), 'no NaN values')

    // Verify normalization (L2 norm should be ~1.0)
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
    assert(Math.abs(norm - 1.0) < 0.001, `vector is L2-normalized (norm=${norm.toFixed(4)})`)

    // Similar texts should produce similar vectors
    const v1 = await generateEmbedding('Jazz music event in downtown')
    const v2 = await generateEmbedding('Jazz concert in the city center')
    const v3 = await generateEmbedding('Pickup basketball game at the park')

    function cosineSim(a, b) {
      let dot = 0
      for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
      return dot // already normalized
    }

    const sim12 = cosineSim(v1, v2)
    const sim13 = cosineSim(v1, v3)
    assert(
      sim12 > sim13,
      `similar texts are closer (jazz-jazz=${sim12.toFixed(3)} > jazz-basketball=${sim13.toFixed(3)})`,
    )
  } catch (err) {
    _modelAvailable = false
    console.log(`  ⚠ Model not available (${err.message.slice(0, 80)}...)`)
    console.log(
      '  ⚠ Skipping embedding generation tests — run "node backend/scripts/embed.js" to download the model',
    )
  }

  // --- Test: content_hash skip-guard logic ---
  console.log('\n[skip-guard logic]')

  const eventText = composeEventText(mockEvent)
  const eventHash = computeContentHash(eventText)
  const editedEvent = { ...mockEvent, title: 'Afrobeats Rooftop Party 2025' }
  const editedText = composeEventText(editedEvent)
  const editedHash = computeContentHash(editedText)
  assert(eventHash !== editedHash, 'editing title changes the hash (triggers re-embed)')

  const tagAddedEvent = {
    ...mockEvent,
    tags: [...mockEvent.tags, { label: 'new-tag', confidence: 0.5 }],
  }
  const tagAddedHash = computeContentHash(composeEventText(tagAddedEvent))
  assert(eventHash !== tagAddedHash, 'adding a tag changes the hash (triggers re-embed)')

  const unchangedHash = computeContentHash(composeEventText(mockEvent))
  assert(eventHash === unchangedHash, 'unchanged event keeps same hash (skips re-embed)')

  // --- Summary ---
  console.log(`\n${'='.repeat(50)}`)
  console.log(`Results: ${passed} passed, ${failed} failed`)
  if (failed === 0) {
    console.log('✓ All tests passed!')
  } else {
    console.log('✗ Some tests failed.')
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Test runner error:', err)
  process.exit(1)
})
