import { Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { MotionConfig, LazyMotion, domAnimation } from 'motion/react'
import { AppProvider, useApp } from './context/AppContext'
import { ToastProvider } from './context/ToastContext'
import { ModalProvider } from './context/ModalContext'
import { ThemeProvider } from './context/ThemeContext'
import { TopNav, BottomBar } from './components/nav'
import { AIAssistant } from './components/AIAssistant'
import { Landing } from './screens/Landing'
import { Auth } from './screens/Auth'
import { Onboarding } from './screens/Onboarding'
import { ForYouFeed } from './screens/ForYouFeed'
import { Discover } from './screens/Discover'
import { EventDetail } from './screens/EventDetail'
import { SocialFeed } from './screens/SocialFeed'
import { CreateEvent } from './screens/CreateEvent'
import { SportsPickupDetail } from './screens/SportsPickupDetail'
import { OrganizerProfile } from './screens/OrganizerProfile'
import { UserProfile } from './screens/UserProfile'
import { Settings } from './screens/Settings'
import { OrganizerAnalytics } from './screens/OrganizerAnalytics'
import { EventAnalytics } from './screens/EventAnalytics'

/* Routes that render standalone (no app chrome / bars / assistant). */
const BARE_ROUTES = ['/', '/auth', '/onboarding']

/* Gate a member-only route. While the session is still resolving (authReady
   false) we render nothing rather than redirect, so a logged-in user who
   refreshes on /profile isn't bounced to /auth before me() comes back. */
function ProtectedRoute({ children }) {
  const { isLoggedIn, authReady } = useApp()
  const { pathname } = useLocation()
  if (!authReady) return null
  if (!isLoggedIn) {
    return <Navigate to={`/auth?mode=login&next=${encodeURIComponent(pathname)}`} replace />
  }
  return children
}

function Shell() {
  const { pathname } = useLocation()
  const { isLoggedIn } = useApp()
  const bare = BARE_ROUTES.includes(pathname)

  return (
    <div className="min-h-screen bg-white">
      {!bare && <TopNav />}

      <main className={bare ? '' : 'pb-16 md:pb-0'}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/feed" element={<ForYouFeed />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/event/:id" element={<EventDetail />} />
          <Route path="/sports/:id" element={<SportsPickupDetail />} />
          <Route path="/social" element={<SocialFeed />} />
          <Route
            path="/create"
            element={
              <ProtectedRoute>
                <CreateEvent />
              </ProtectedRoute>
            }
          />
          <Route path="/organizer/:id" element={<OrganizerProfile />} />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <UserProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizer/analytics"
            element={
              <ProtectedRoute>
                <OrganizerAnalytics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizer/events/:id/analytics"
            element={
              <ProtectedRoute>
                <EventAnalytics />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Mobile bottom bar shows on every in-app route (logged-out phones need
          it to reach Feed/Discover/Social); the AI assistant stays login-only. */}
      {!bare && <BottomBar />}
      {!bare && isLoggedIn && <AIAssistant />}
    </div>
  )
}

export default function App() {
  // ModalProvider is inside BrowserRouter (from main.jsx) so it can navigate;
  // ToastProvider + ModalProvider wrap AppProvider so any screen can raise
  // toasts and dialogs. QueryClientProvider lives at the root in main.jsx.
  return (
    // LazyMotion + domAnimation loads only the ~15kb DOM feature set (vs the
    // full ~43kb engine) — enough for our animations, variants, whileTap and
    // AnimatePresence exits (excludes drag/layout, which we don't use). Every
    // animated element uses the lightweight `m.*` from './lib/motion'.
    // reducedMotion="user" makes animations honor the OS reduce-motion setting.
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <ThemeProvider>
          <ToastProvider>
            <ModalProvider>
              <AppProvider>
                <Shell />
              </AppProvider>
            </ModalProvider>
          </ToastProvider>
        </ThemeProvider>
      </MotionConfig>
    </LazyMotion>
  )
}
