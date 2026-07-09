import { Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import { ToastProvider } from './context/ToastContext'
import { ModalProvider } from './context/ModalContext'
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

/* Routes that render standalone (no app chrome / bars / assistant). */
const BARE_ROUTES = ['/', '/auth', '/onboarding']

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
          <Route path="/create" element={<CreateEvent />} />
          <Route path="/organizer/:id" element={<OrganizerProfile />} />
          <Route path="/profile" element={<UserProfile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* mobile bottom bar + AI assistant only inside the app */}
      {!bare && isLoggedIn && <BottomBar />}
      {!bare && isLoggedIn && <AIAssistant />}
    </div>
  )
}

export default function App() {
  // ModalProvider is inside BrowserRouter (from main.jsx) so it can navigate;
  // ToastProvider + ModalProvider wrap AppProvider so any screen can raise
  // toasts and dialogs. QueryClientProvider lives at the root in main.jsx.
  return (
    <ToastProvider>
      <ModalProvider>
        <AppProvider>
          <Shell />
        </AppProvider>
      </ModalProvider>
    </ToastProvider>
  )
}
