import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Compass,
  Home,
  PlusCircle,
  Users,
  User,
  LogIn,
  LogOut,
  Settings,
  Moon,
  Sun,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import { NotificationBell } from './NotificationBell'

const LOGO = <img src="/logo.png" alt="Loop" className="h-11 w-auto" />

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
      'rounded-button px-4 py-2 text-lg transition-colors',
      active ? 'font-semibold text-primary' : 'font-medium text-text-secondary hover:text-ink',
    )

  return (
    <header className="sticky top-0 z-30 border-b border-border-light bg-white/95 backdrop-blur-md">
      <div className="loop-container flex h-16 items-center justify-between gap-4 md:h-20">
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
              <ProfileMenu user={user} role={role} onLogout={onLogout} />
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
   ProfileMenu — avatar button that opens a dropdown with View profile,
   Settings, a light/dark toggle, and Log out. Closes on outside click,
   Escape, or route navigation.
-------------------------------------------------------------------------- */
function ProfileMenu({ user, role, onLogout }) {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const isOrganizer = role === 'organizer'

  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const go = (to) => {
    setOpen(false)
    navigate(to)
  }

  const itemClass =
    'flex w-full items-center gap-3 px-3 py-2.5 text-sm text-ink transition-colors hover:bg-surface'

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Your profile menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid h-10 w-10 place-items-center rounded-full"
      >
        <img
          src={user?.avatar}
          alt=""
          className="h-9 w-9 rounded-full border border-border-light bg-surface object-cover"
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-40 w-56 overflow-hidden rounded-card border border-border-light bg-white shadow-card-hover"
        >
          <div className="border-b border-border-light px-3 py-3">
            <div className="truncate text-sm font-semibold text-ink">
              {user?.name || 'Your account'}
            </div>
            {user?.email && <div className="truncate text-xs text-text-muted">{user.email}</div>}
          </div>

          <button role="menuitem" onClick={() => go('/profile')} className={itemClass}>
            <User size={16} className="text-text-secondary" />
            View profile
          </button>
          {isOrganizer && (
            <button
              role="menuitem"
              onClick={() => go('/organizer/analytics')}
              className={itemClass}
            >
              <BarChart3 size={16} className="text-text-secondary" />
              Analytics
            </button>
          )}
          <button role="menuitem" onClick={() => go('/settings')} className={itemClass}>
            <Settings size={16} className="text-text-secondary" />
            Settings
          </button>

          <button
            role="menuitemcheckbox"
            aria-checked={theme === 'dark'}
            onClick={toggleTheme}
            className={cn(itemClass, 'justify-between')}
          >
            <span className="flex items-center gap-3">
              {theme === 'dark' ? (
                <Moon size={16} className="text-text-secondary" />
              ) : (
                <Sun size={16} className="text-text-secondary" />
              )}
              {theme === 'dark' ? 'Dark mode' : 'Light mode'}
            </span>
            <span
              className={cn(
                'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                theme === 'dark' ? 'bg-primary' : 'bg-border-light',
              )}
              aria-hidden="true"
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                  theme === 'dark' ? 'translate-x-4' : 'translate-x-0.5',
                )}
              />
            </span>
          </button>

          <div className="border-t border-border-light">
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onLogout()
              }}
              className={cn(itemClass, 'text-accent hover:bg-accent/5')}
            >
              <LogOut size={16} />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------------------------
   BottomBar — mobile-only fixed bottom tab bar; Create is an elevated pink btn
-------------------------------------------------------------------------- */
export function BottomBar() {
  const { pathname } = useLocation()
  const { isLoggedIn, role } = useApp()
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
      {/* Logged-out phones still get the three public sections + a login CTA;
          the elevated Create button and Profile tab are login-only. */}
      {isLoggedIn && canCreate ? (
        <Link
          to="/create"
          className="-mt-6 flex flex-1 flex-col items-center"
          aria-label="Create event"
        >
          <span className="grid h-14 w-14 place-items-center rounded-full bg-accent text-white shadow-card-hover">
            <PlusCircle size={26} />
          </span>
        </Link>
      ) : null}
      {tab('/social', Users, 'Social')}
      {isLoggedIn ? tab('/profile', User, 'Profile') : tab('/auth?mode=login', LogIn, 'Log in')}
    </nav>
  )
}
