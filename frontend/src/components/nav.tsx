import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bell, Compass, Home, PlusCircle, Users, Search, User } from 'lucide-react'
import { cn } from '../lib/utils'
import { useApp } from '../context/AppContext'

const LOGO = (
  <span className="flex items-center gap-2 font-display text-xl font-bold text-ink">
    <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary">
      <span className="block h-3 w-3 rounded-full border-[3px] border-white" />
    </span>
    Loop
  </span>
)

const NAV_LINKS = [
  { label: 'For You', to: '/feed' },
  { label: 'Discover', to: '/discover' },
  { label: 'Social', to: '/social' },
]

/* --------------------------------------------------------------------------
   TopNav — sticky white/95 backdrop. Logo left, links center, auth/profile right
-------------------------------------------------------------------------- */
export function TopNav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { isLoggedIn, user, role } = useApp()
  const canCreate = role === 'organizer' || role === 'promoter' || role === 'sportsHost'

  return (
    <header className="sticky top-0 z-30 border-b border-border-light bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5">
        <Link to={isLoggedIn ? '/feed' : '/'}>{LOGO}</Link>

        {isLoggedIn && (
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((l) => {
              const active = pathname.startsWith(l.to)
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  className={cn(
                    'rounded-button px-4 py-2 text-sm font-medium transition-colors',
                    active ? 'text-primary' : 'text-text-secondary hover:text-ink',
                  )}
                >
                  {l.label}
                </Link>
              )
            })}
            {canCreate && (
              <Link
                to="/create"
                className={cn(
                  'rounded-button px-4 py-2 text-sm font-medium transition-colors',
                  pathname.startsWith('/create')
                    ? 'text-primary'
                    : 'text-text-secondary hover:text-ink',
                )}
              >
                Create
              </Link>
            )}
          </nav>
        )}

        <div className="flex items-center gap-3">
          {isLoggedIn ? (
            <>
              <button
                className="relative grid h-10 w-10 place-items-center rounded-button text-text-secondary hover:bg-surface"
                aria-label="Notifications"
              >
                <Bell size={20} />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" />
              </button>
              <button onClick={() => navigate('/profile')} aria-label="Profile">
                <img
                  src={user?.avatar}
                  alt=""
                  className="h-9 w-9 rounded-full border border-border-light object-cover"
                />
              </button>
            </>
          ) : (
            <>
              <Link
                to="/auth?mode=login"
                className="rounded-button px-4 py-2 text-sm font-semibold text-text-secondary hover:text-ink"
              >
                Log in
              </Link>
              <Link
                to="/auth?mode=signup"
                className="rounded-button bg-accent px-4 py-2 text-sm font-semibold text-white transition-transform active:scale-95"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

/* --------------------------------------------------------------------------
   BottomBar — mobile-only fixed bottom tab bar; Create is an elevated pink btn
-------------------------------------------------------------------------- */
export function BottomBar() {
  const { pathname } = useLocation()
  const { role } = useApp()
  const canCreate = role === 'organizer' || role === 'promoter' || role === 'sportsHost'

  const tab = (to: string, Icon: typeof Home, label: string) => {
    const active = pathname.startsWith(to)
    return (
      <Link
        to={to}
        className={cn(
          'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]',
          active ? 'text-primary' : 'text-text-muted',
        )}
      >
        <Icon size={22} />
        {label}
      </Link>
    )
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center border-t border-border-light bg-white/95 px-2 backdrop-blur-md md:hidden">
      {tab('/feed', Home, 'For You')}
      {tab('/discover', Compass, 'Discover')}
      {canCreate ? (
        <Link
          to="/create"
          className="-mt-6 flex flex-1 flex-col items-center"
          aria-label="Create event"
        >
          <span className="grid h-14 w-14 place-items-center rounded-full bg-accent text-white shadow-card-hover">
            <PlusCircle size={26} />
          </span>
        </Link>
      ) : (
        tab('/social', Search, 'Search')
      )}
      {tab('/social', Users, 'Social')}
      {tab('/profile', User, 'Profile')}
    </nav>
  )
}
