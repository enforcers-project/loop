import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Compass, Home, PlusCircle, Users, Search, User, LogOut } from 'lucide-react'
import { cn } from '../lib/utils'
import { useApp } from '../context/AppContext'
import { NotificationBell } from './NotificationBell'

const LOGO = <img src="/logo.png" alt="Loop" className="h-7 w-auto" />

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
  const { isLoggedIn, user, role, logout } = useApp()
  const canCreate = role === 'organizer'

  const onLogout = async () => {
    await logout()
    navigate('/')
  }

  const linkClass = (active) =>
    cn(
      'rounded-button px-4 py-2 text-base transition-colors',
      active ? 'font-semibold text-primary' : 'font-medium text-text-secondary hover:text-ink',
    )

  return (
    <header className="sticky top-0 z-30 border-b border-border-light bg-white/95 backdrop-blur-md">
      <div className="loop-container flex h-16 items-center justify-between gap-4">
        <Link to={isLoggedIn ? '/feed' : '/'} className="flex-shrink-0">
          {LOGO}
        </Link>

        {isLoggedIn && (
          <nav className="hidden items-center gap-2 md:flex">
            {NAV_LINKS.map((l) => (
              <Link key={l.to} to={l.to} className={linkClass(pathname.startsWith(l.to))}>
                {l.label}
              </Link>
            ))}
            {canCreate && (
              <Link to="/create" className={linkClass(pathname.startsWith('/create'))}>
                Create
              </Link>
            )}
          </nav>
        )}

        <div className="flex flex-shrink-0 items-center gap-2">
          {isLoggedIn ? (
            <>
              <NotificationBell />
              <button
                onClick={() => navigate('/profile')}
                aria-label="Your profile"
                className="grid h-10 w-10 place-items-center rounded-full"
              >
                <img
                  src={user?.avatar}
                  alt=""
                  className="h-9 w-9 rounded-full border border-border-light bg-surface object-cover"
                />
              </button>
              <button
                onClick={onLogout}
                aria-label="Log out"
                className="grid h-10 w-10 place-items-center rounded-button text-text-secondary transition-colors hover:bg-surface hover:text-ink"
              >
                <LogOut size={19} />
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
  const canCreate = role === 'organizer'

  const tab = (to, Icon, label) => {
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
    <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center border-t border-border-light bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
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
