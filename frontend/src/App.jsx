import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { SocketProvider } from './context/SocketContext'
import { RoomProvider } from './context/RoomContext'
import LandingPage from './pages/LandingPage'
import RoomsPage from './pages/RoomsPage'
import RoomPage from './pages/RoomPage'

/**
 * App — root router.
 * SocketProvider wraps everything so the socket singleton
 * is available to any component tree.
 */
export default function App() {
  return (
    <BrowserRouter>
      <SocketProvider>
        <RoomProvider>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/rooms" element={<RoomsPage />} />
            <Route path="/room/:roomId" element={<RoomPage />} />
          </Routes>

          {/* Global toast container — positioned top-right */}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3500,
              style: {
                background: 'rgba(17, 24, 39, 0.9)',
                backdropFilter: 'blur(20px)',
                border: '1px solid #27272A',
                color: '#e5e1e4',
                fontFamily: 'Geist, sans-serif',
                fontSize: '14px',
                borderRadius: '12px',
                padding: '12px 16px',
              },
              success: {
                iconTheme: { primary: '#ffb3ad', secondary: '#68000a' },
              },
              error: {
                iconTheme: { primary: '#ffb4ab', secondary: '#690005' },
              },
            }}
          />
        </RoomProvider>
      </SocketProvider>
    </BrowserRouter>
  )
}
