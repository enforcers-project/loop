import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const CATEGORIES = [
  { slug: 'music', name: 'Music', colorHex: '#6D5EFC', icon: 'music-note', sortOrder: 0 },
  { slug: 'nightlife', name: 'Nightlife', colorHex: '#FF2E74', icon: 'moon', sortOrder: 1 },
  { slug: 'sports', name: 'Sports', colorHex: '#16C784', icon: 'trophy', sortOrder: 2 },
  { slug: 'networking', name: 'Networking', colorHex: '#2D8CFF', icon: 'people', sortOrder: 3 },
  { slug: 'food', name: 'Food', colorHex: '#FFB020', icon: 'restaurant', sortOrder: 4 },
  { slug: 'campus', name: 'Campus', colorHex: '#FF7A45', icon: 'school', sortOrder: 5 },
]

const INTERESTS = [
  { slug: 'afrobeats', label: 'Afrobeats', category: 'music', icon: 'headphones', sortOrder: 0 },
  { slug: 'hiphop', label: 'Hip-Hop', category: 'music', icon: 'mic', sortOrder: 1 },
  { slug: 'house', label: 'House / EDM', category: 'music', icon: 'disc', sortOrder: 2 },
  { slug: 'live-bands', label: 'Live Bands', category: 'music', icon: 'guitar', sortOrder: 3 },
  {
    slug: 'rooftop',
    label: 'Rooftop Parties',
    category: 'nightlife',
    icon: 'sparkles',
    sortOrder: 0,
  },
  { slug: 'clubbing', label: 'Clubbing', category: 'nightlife', icon: 'disco-ball', sortOrder: 1 },
  { slug: 'lounges', label: 'Lounges', category: 'nightlife', icon: 'cocktail', sortOrder: 2 },
  { slug: 'day-party', label: 'Day Parties', category: 'nightlife', icon: 'sun', sortOrder: 3 },
  { slug: 'soccer', label: 'Soccer', category: 'sports', icon: 'football', sortOrder: 0 },
  { slug: 'basketball', label: 'Basketball', category: 'sports', icon: 'basketball', sortOrder: 1 },
  { slug: 'volleyball', label: 'Volleyball', category: 'sports', icon: 'volleyball', sortOrder: 2 },
  { slug: 'running', label: 'Running Clubs', category: 'sports', icon: 'footprints', sortOrder: 3 },
  { slug: 'startups', label: 'Startups', category: 'networking', icon: 'rocket', sortOrder: 0 },
  { slug: 'tech', label: 'Tech Meetups', category: 'networking', icon: 'cpu', sortOrder: 1 },
  {
    slug: 'career',
    label: 'Career Fairs',
    category: 'networking',
    icon: 'briefcase',
    sortOrder: 2,
  },
  {
    slug: 'creators',
    label: 'Creator Mixers',
    category: 'networking',
    icon: 'palette',
    sortOrder: 3,
  },
  { slug: 'foodie', label: 'Food Festivals', category: 'food', icon: 'utensils', sortOrder: 0 },
  { slug: 'brunch', label: 'Brunch', category: 'food', icon: 'coffee', sortOrder: 1 },
  { slug: 'popups', label: 'Pop-ups', category: 'food', icon: 'store', sortOrder: 2 },
  { slug: 'tastings', label: 'Tastings', category: 'food', icon: 'wine', sortOrder: 3 },
  {
    slug: 'campus-life',
    label: 'Campus Life',
    category: 'campus',
    icon: 'graduation-cap',
    sortOrder: 0,
  },
  { slug: 'greek', label: 'Greek Life', category: 'campus', icon: 'landmark', sortOrder: 1 },
  { slug: 'clubs-orgs', label: 'Clubs & Orgs', category: 'campus', icon: 'users', sortOrder: 2 },
  { slug: 'study-jams', label: 'Study Jams', category: 'campus', icon: 'book-open', sortOrder: 3 },
]

async function main() {
  console.log('Seeding categories...')
  for (const cat of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, colorHex: cat.colorHex, icon: cat.icon, sortOrder: cat.sortOrder },
      create: cat,
    })
  }

  const cats = await prisma.category.findMany()
  const catBySlug = Object.fromEntries(cats.map((c) => [c.slug, c.id]))

  console.log('Seeding interests...')
  for (const { category, ...data } of INTERESTS) {
    await prisma.interest.upsert({
      where: { slug: data.slug },
      update: { ...data, categoryId: catBySlug[category] },
      create: { ...data, categoryId: catBySlug[category] },
    })
  }

  console.log(`Done — ${CATEGORIES.length} categories, ${INTERESTS.length} interests.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
