import { useCallback } from 'react'
import { useAuth, useClerk } from '@clerk/react'
import { toast } from 'react-hot-toast'

/**
 * useCreateRoomGate — Reusable auth gate for all room creation triggers.
 *
 * Ensures only authenticated users can open the Create Room modal.
 * If signed out: prompts the user and opens Clerk's sign-in flow.
 * If loading: prevents accidental duplicate actions.
 *
 * @param {() => void} onOpenModal - callback to open CreateRoomModal
 * @returns {{ handleCreateRoom: () => void, isLoaded: boolean, isSignedIn: boolean }}
 */
export default function useCreateRoomGate(onOpenModal) {
  const { isLoaded, isSignedIn } = useAuth()
  const { openSignIn } = useClerk()

  const handleCreateRoom = useCallback(() => {
    if (!isLoaded) {
      toast('Authenticating...', { icon: '⏳' })
      return
    }

    if (isSignedIn) {
      if (typeof onOpenModal === 'function') {
        onOpenModal()
      }
    } else {
      toast('Please sign in to create a watch party.', {
        icon: '🔐',
        duration: 4000,
      })
      openSignIn?.()
    }
  }, [isLoaded, isSignedIn, openSignIn, onOpenModal])

  return {
    handleCreateRoom,
    isLoaded,
    isSignedIn: Boolean(isSignedIn),
  }
}
