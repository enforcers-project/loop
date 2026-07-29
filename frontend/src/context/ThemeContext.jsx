import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'

// Theme persists to localStorage under 'loop:theme' and applies as a `.dark`
// class on <html> so CSS overrides in index.css can flip the design tokens.
// System preference is the initial fallback for a first-time visitor.
const STORAGE_KEY = 'loop:theme'

function readInitialTheme() {
  if (typeof window === 'undefined') return 'light'
  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readInitialTheme)
  // Screens that must render in light mode regardless of the user's setting
  // (landing / auth / onboarding — marketing surfaces designed light-only)
  // register themselves via useForceLight. We reference-count so overlapping
  // mounts still restore the user's real theme once the last force unmounts.
  const [forceCount, setForceCount] = useState(0)

  useEffect(() => {
    const root = document.documentElement
    const effective = forceCount > 0 ? 'light' : theme
    root.classList.toggle('dark', effective === 'dark')
    root.style.colorScheme = effective
    // Only persist the user-chosen theme; the force overlay is transient.
    window.localStorage.setItem(STORAGE_KEY, theme)
  }, [theme, forceCount])

  const setTheme = useCallback((next) => setThemeState(next), [])
  const toggleTheme = useCallback(() => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')), [])
  const pushForceLight = useCallback(() => setForceCount((n) => n + 1), [])
  const popForceLight = useCallback(() => setForceCount((n) => Math.max(0, n - 1)), [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, pushForceLight, popForceLight }}>
      {children}
    </ThemeContext.Provider>
  )
}

// Force the app into light mode while this hook is mounted. Meant for marketing
// / onboarding surfaces (Landing, Auth, Onboarding) that are designed as a
// light-only experience — flipping them to dark breaks the composition (hero
// contrast, image mockups, brand feel). User's real setting is restored on
// unmount so entering the app respects their choice.
// eslint-disable-next-line react-refresh/only-export-components
export function useForceLight() {
  const { pushForceLight, popForceLight } = useContext(ThemeContext) || {}
  const activeRef = useRef(false)
  useEffect(() => {
    if (!pushForceLight) return
    pushForceLight()
    activeRef.current = true
    return () => {
      if (activeRef.current) popForceLight?.()
      activeRef.current = false
    }
  }, [pushForceLight, popForceLight])
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
