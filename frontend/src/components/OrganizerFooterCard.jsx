import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { formatCount, pluralize } from '../lib/utils'
import { FollowBtn, VerifiedBadge, RoleBadge } from './primitives'

/**
 * OrganizerFooterCard — the "hosted by" card that closes the event detail
 * page. Big avatar, name, verified/role badges, follower count, follow CTA
 * and a link to the full organizer profile. Rendered on a light card so it
 * blends with the About/Comments rhythm below the hero.
 */
export function OrganizerFooterCard({ organizer, eventCount }) {
  const { followingIds, toggleFollow } = useApp()
  if (!organizer) return null
  const following = followingIds.has(organizer.id)

  return (
    <section className="rounded-card border border-border-light bg-white p-6 shadow-card md:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Hosted by</p>
      <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row sm:gap-5">
        <img
          src={organizer.avatar}
          alt=""
          className="h-16 w-16 flex-shrink-0 rounded-full border border-border-light object-cover sm:h-20 sm:w-20"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/organizer/${organizer.id}`}
              className="font-display text-lg font-bold text-ink hover:underline"
            >
              {organizer.name}
            </Link>
            {organizer.verified && <VerifiedBadge size={16} />}
            {organizer.role && <RoleBadge role={organizer.role} />}
          </div>
          {organizer.handle && <p className="mt-0.5 text-sm text-text-muted">{organizer.handle}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-text-secondary">
            {typeof organizer.followers === 'number' && (
              <span>
                <span className="font-semibold text-ink">{formatCount(organizer.followers)}</span>{' '}
                {pluralize(organizer.followers, 'follower')}
              </span>
            )}
            {typeof eventCount === 'number' && eventCount > 0 && (
              <span>
                <span className="font-semibold text-ink">{eventCount}</span>{' '}
                {pluralize(eventCount, 'event')}
              </span>
            )}
          </div>
          {organizer.bio && (
            <p className="mt-3 max-w-prose text-sm leading-relaxed text-text-secondary">
              {organizer.bio}
            </p>
          )}
        </div>
        <div className="w-full flex-shrink-0 sm:w-auto">
          <FollowBtn following={following} onToggle={() => toggleFollow(organizer.id)} sm />
        </div>
      </div>
    </section>
  )
}
