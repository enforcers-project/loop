import { useNavigate } from 'react-router-dom'
import { Moon, Sun, LogOut, User } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import { cn } from '../lib/utils'

/* Row wrapper for a labeled control inside a settings card. */
function Row({ title, description, children }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border-light px-5 py-4 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-ink">{title}</div>
        {description && (
          <div className="mt-0.5 text-xs text-text-secondary">{description}</div>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

export function Settings() {
  const navigate = useNavigate()
  const { user, logout } = useApp()
  const { theme, setTheme } = useTheme()

  const onLogout = async () => {
    await logout()
    navigate('/')
  }

  const themeBtn = (value, Icon, label) => {
    const active = theme === value
    return (
      <button
        onClick={() => setTheme(value)}
        aria-pressed={active}
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-button px-3 text-sm font-medium transition-colors',
          active
            ? 'border border-primary bg-primary-light text-primary'
            : 'border border-border-light bg-white text-text-secondary hover:border-text-muted',
        )}
      >
        <Icon size={15} />
        {label}
      </button>
    )
  }

  return (
    <div className="loop-container py-8">
      <h1 className="font-display text-2xl font-bold text-ink">Settings</h1>
      <p className="mt-1 text-sm text-text-secondary">Manage your account and preferences.</p>

      <section className="mt-6 overflow-hidden rounded-card border border-border-light bg-white">
        <Row
          title="Profile"
          description={user?.email || 'View and edit your public profile.'}
        >
          <button
            onClick={() => navigate('/profile')}
            className="inline-flex h-9 items-center gap-1.5 rounded-button border border-border-light bg-white px-3 text-sm font-medium text-text-secondary hover:border-text-muted"
          >
            <User size={15} />
            View profile
          </button>
        </Row>

        <Row title="Appearance" description="Choose light or dark mode.">
          <div className="flex gap-2">
            {themeBtn('light', Sun, 'Light')}
            {themeBtn('dark', Moon, 'Dark')}
          </div>
        </Row>
      </section>

      <section className="mt-4 overflow-hidden rounded-card border border-border-light bg-white">
        <Row title="Log out" description="Sign out of your Loop account.">
          <button
            onClick={onLogout}
            className="inline-flex h-9 items-center gap-1.5 rounded-button border border-accent bg-white px-3 text-sm font-semibold text-accent hover:bg-accent/5"
          >
            <LogOut size={15} />
            Log out
          </button>
        </Row>
      </section>
    </div>
  )
}
