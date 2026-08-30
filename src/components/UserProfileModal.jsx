import { X } from 'lucide-react'
import { useUserProfile } from '../context/UserProfileContext'
import ProfileView from './ProfileView'
import { useEscapeKey } from '../hooks/useEscapeKey'

export default function UserProfileModal() {
  const { isProfileModalOpen, closeProfileModal } = useUserProfile()

  useEscapeKey(isProfileModalOpen, closeProfileModal)

  if (!isProfileModalOpen) return null

  return (
    <div className="modal-backdrop-overlay animate-fade-in" onClick={closeProfileModal}>
      <div
        className="modal-container user-profile-modal-container glass-panel animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header profile-modal-top-header">
          <div className="flex items-center gap-2">
            <span className="modal-title font-mono">User Profile & Preferences</span>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={closeProfileModal}
            aria-label="Close Profile"
          >
            <X size={18} />
          </button>
        </div>

        <div className="profile-modal-scrollable-body">
          <ProfileView />
        </div>
      </div>
    </div>
  )
}
