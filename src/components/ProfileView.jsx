import { useState, useEffect, useMemo } from 'react'
import {
  User, Save, LogIn, LogOut,
  ShieldCheck, Volume2, VolumeX, Eye, EyeOff,
  Zap, CheckCircle2, Radio,
  FileText, Mail,
} from 'lucide-react'
import { useUserProfile } from '../context/UserProfileContext'
import { useSiweAuth } from '../context/SiweAuthContext'

function ToggleSwitch({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`profile-toggle-switch${checked ? ' active' : ''}`}
      onClick={onChange}
    >
      <span className="profile-toggle-thumb" />
    </button>
  )
}

/**
 * Field limits.
 *
 * Unbounded fields accepted 20,000 characters, which fills the browser's
 * storage quota, breaks any layout that renders them, and becomes an abuse
 * vector the moment profiles are public and server-backed. Enforced in the
 * change handler as well as via maxLength, because the attribute does not
 * cover every paste path and does nothing for a value read back from storage.
 */
const LIMITS = {
  displayName: 40,
  username: 20,
  email: 254, // RFC 5321 maximum
  bio: 160,
}

const clamp = (value, max) => String(value ?? '').slice(0, max)

function FormField({ label, hint, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800,
          letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.48)',
        }}>
          {label}
        </span>
        {hint && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function StyledInput({ icon: Icon, rightSlot, ...props }) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      {Icon && (
        <Icon size={14} style={{ position: 'absolute', left: 13, color: 'rgba(255,255,255,0.28)', pointerEvents: 'none' }} />
      )}
      <input
        style={{
          width: '100%', height: 40,
          padding: Icon ? '0 14px 0 38px' : '0 14px',
          paddingRight: rightSlot ? 40 : 14,
          borderRadius: 10, background: 'rgba(8,12,20,0.8)',
          border: '1px solid rgba(255,255,255,0.09)', color: '#f0f4f8',
          fontFamily: 'var(--font-mono)', fontSize: 12.5, outline: 'none', transition: 'all 0.2s ease',
        }}
        onFocus={e => { e.target.style.borderColor = 'var(--pulse-cyan)'; e.target.style.boxShadow = '0 0 0 3px rgba(0,229,255,0.1)' }}
        onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.09)'; e.target.style.boxShadow = 'none' }}
        {...props}
      />
      {rightSlot && (
        <div style={{ position: 'absolute', right: 10, display: 'flex', alignItems: 'center' }}>
          {rightSlot}
        </div>
      )}
    </div>
  )
}

function SectionCard({ icon: Icon, iconColor = 'var(--pulse-cyan)', title, subtitle, children, noPadding, className = '' }) {
  return (
    <div className={`profile-section-card ${className}`}>
      <div className="profile-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="profile-card-icon-badge">
            <Icon size={15} style={{ color: iconColor }} />
          </div>
          <div>
            <h3 className="profile-card-title">{title}</h3>
            <p className="profile-card-subtitle">{subtitle}</p>
          </div>
        </div>
      </div>
      {noPadding ? children : <div className="profile-card-form">{children}</div>}
    </div>
  )
}

export default function ProfileView() {
  // Wallet sign-in replaced the password vault. The rest of this view still
  // reads from the local profile store; wiring it to the backend is the next
  // step, so `currentUser` is shaped from the session for now.
  const { account, isSignedIn, signIn, signOut } = useSiweAuth()
  // Memoised on the address: built inline it was a new object every render,
  // which re-ran the sync effect below on every pass.
  const currentUser = useMemo(
    () => (account ? { username: account.slice(2, 8), displayName: null, email: null } : null),
    [account]
  )
  const isAuthenticated = isSignedIn
  const openAuthModal = signIn
  const { profile, preferences, updateProfile, updatePreferences, triggerSound } = useUserProfile()

  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [bio, setBio] = useState('')
  const [saveMsg, setSaveMsg] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    // The saved profile wins over anything derived from the address. Reading
    // the session stub first silently replaced a saved username with the hex
    // fragment on every load, so an edited handle never survived a reload.
    setDisplayName(clamp(profile.displayName || currentUser?.displayName || '', LIMITS.displayName))
    setUsername(clamp(profile.username || currentUser?.username || '', LIMITS.username))
    setEmail(clamp(profile.email || currentUser?.email || '', LIMITS.email))
    setBio(clamp(profile.bio || '', LIMITS.bio))
  }, [profile, currentUser])

  const initials = (displayName || username || 'PT').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const displayedName = displayName || currentUser?.displayName || 'Pulse Trader'
  const displayedHandle = username || currentUser?.username || 'pulse_degen'

  const saveProfile = e => {
    e?.preventDefault()
    setIsSaving(true)
    updateProfile({
      displayName: displayName.trim() || 'Pulse Trader',
      username: username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '') || 'pulse_degen',
      email: email.trim(),
      bio: bio.trim(),
    })
    triggerSound('success')
    setSaveMsg('Saved to local vault')
    setTimeout(() => { setSaveMsg(null); setIsSaving(false) }, 2500)
  }


  return (
    <div className="profile-page-frame">
      <div className="profile-page-shell">

        <div className="profile-hero-card">
          <div className="profile-hero-content">
            <div className="profile-avatar-badge">
              <div className="profile-avatar-glow-ring" />
              <span className="profile-avatar-text">{initials}</span>
            </div>
            <div className="profile-identity-col">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h1 className="profile-display-name">{displayedName}</h1>
                {/* Only claimed while a wallet signature actually backs it.
                    Shown unconditionally, it told signed-out visitors their
                    wallet was verified when no wallet was connected at all. */}
                {isAuthenticated ? (
                  <span className="profile-status-badge"><ShieldCheck size={9} /> Wallet Verified</span>
                ) : (
                  <span className="profile-status-badge is-muted">Not signed in</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className="profile-handle-sub">@{displayedHandle}</span>
                <span className="profile-dot-separator">·</span>
                <span className="profile-network-sub"><Radio size={10} style={{ marginRight: 4 }} />PulseChain · 369</span>
              </div>
              {bio && (
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>
                  &ldquo;{bio}&rdquo;
                </p>
              )}
            </div>
          </div>
          <div className="profile-hero-actions">
            {!isAuthenticated ? (
              <button className="btn-sm btn-glow-pulse" onClick={() => openAuthModal('signin')}><LogIn size={13} />Sign In</button>
            ) : (
              <button className="btn-sm" style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', color: 'var(--pulse-red)' }} onClick={signOut}><LogOut size={13} />Sign Out</button>
            )}
          </div>
        </div>

        <div className="profile-cards-grid">

          {/* Full width now that the security card it used to sit beside has
              gone with password sign-in. */}
          <SectionCard className="profile-cards-grid-full" icon={User} iconColor="var(--pulse-cyan)" title="Identity & Profile" subtitle="Your public trader persona on PulseChain">
            <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <FormField label="Display Name">
                <StyledInput icon={User} type="text" maxLength={LIMITS.displayName} value={displayName} onChange={e => setDisplayName(clamp(e.target.value, LIMITS.displayName))} placeholder="e.g. Satoshi Whale" required />
              </FormField>
              <FormField label="Username" hint="a–z 0–9 _">
                <StyledInput type="text" maxLength={LIMITS.username} value={username} onChange={e => setUsername(clamp(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''), LIMITS.username))} placeholder="pulse_whale" required />
              </FormField>
              <FormField label="Email Address" hint="Optional">
                <StyledInput icon={Mail} type="email" maxLength={LIMITS.email} value={email} onChange={e => setEmail(clamp(e.target.value, LIMITS.email))} placeholder="name@domain.com" />
              </FormField>
              <FormField label="Trader Bio" hint="Optional">
                <StyledInput icon={FileText} type="text" maxLength={LIMITS.bio} value={bio} onChange={e => setBio(clamp(e.target.value, LIMITS.bio))} placeholder="e.g. PulseChain LP provider & swing trader" />
              </FormField>
              <div className="profile-form-action-row">
                <button type="submit" className="profile-save-btn" disabled={isSaving}><Save size={14} />{isSaving ? 'Saving…' : 'Save Changes'}</button>
                {saveMsg && <span className="profile-success-chip animate-fade-in"><CheckCircle2 size={12} />{saveMsg}</span>}
              </div>
            </form>
          </SectionCard>


          <div className="profile-cards-grid-full">
            <SectionCard icon={Zap} iconColor="var(--pulse-green)" title="Trading Preferences" subtitle="Global swap and DEX engine settings" noPadding>
              <div className="profile-prefs-list">
                <div className="profile-pref-row">
                  <div className="profile-pref-label-col">
                    <span className="profile-pref-title">Slippage Tolerance</span>
                    <p className="profile-pref-desc">Applied to all DEX aggregator swaps</p>
                  </div>
                  <div className="profile-slippage-pills">
                    {['0.5','1.0','2.5','5.0'].map(val => (
                      <button key={val} type="button" className={`profile-slippage-pill${preferences.slippage === val ? ' active' : ''}`} onClick={() => { updatePreferences({ slippage: val }); triggerSound('click') }}>{val}%</button>
                    ))}
                  </div>
                </div>
                <div className="profile-pref-row">
                  <div style={{ display:'flex', alignItems:'center', gap:10, flex:1 }}>
                    {preferences.soundFxEnabled ? <Volume2 size={15} style={{ color:'var(--pulse-cyan)' }} /> : <VolumeX size={15} style={{ color:'var(--text-muted)' }} />}
                    <div className="profile-pref-label-col">
                      <span className="profile-pref-title">Audio Cues & Sound FX</span>
                      <p className="profile-pref-desc">Cyber feedback for trades and actions</p>
                    </div>
                  </div>
                  <ToggleSwitch checked={!!preferences.soundFxEnabled} onChange={() => { updatePreferences({ soundFxEnabled: !preferences.soundFxEnabled }); triggerSound('toggle') }} />
                </div>
                <div className="profile-pref-row">
                  <div style={{ display:'flex', alignItems:'center', gap:10, flex:1 }}>
                    {preferences.privacyMode ? <EyeOff size={15} style={{ color:'var(--pulse-purple)' }} /> : <Eye size={15} style={{ color:'var(--text-muted)' }} />}
                    <div className="profile-pref-label-col">
                      <span className="profile-pref-title">Privacy Mode</span>
                      <p className="profile-pref-desc">Masks USD balances and amounts app-wide</p>
                    </div>
                  </div>
                  <ToggleSwitch checked={!!preferences.privacyMode} onChange={() => { updatePreferences({ privacyMode: !preferences.privacyMode }); triggerSound('toggle') }} />
                </div>
                <div className="profile-pref-row">
                  <div style={{ display:'flex', alignItems:'center', gap:10, flex:1 }}>
                    <Zap size={15} style={{ color:'var(--pulse-yellow)' }} />
                    <div className="profile-pref-label-col">
                      <span className="profile-pref-title">Fast Gas Priority</span>
                      <p className="profile-pref-desc">Auto-suggests high-priority gas in volatile markets</p>
                    </div>
                  </div>
                  <ToggleSwitch checked={!!preferences.fastGasPriority} onChange={() => { updatePreferences({ fastGasPriority: !preferences.fastGasPriority }); triggerSound('toggle') }} />
                </div>
              </div>
            </SectionCard>
          </div>

        </div>

        <div className="profile-security-footer">
          <ShieldCheck size={15} style={{ color:'var(--pulse-green)', flexShrink:0 }} />
          <span>
            <strong>Signed in with your wallet.</strong> PulseDex never sees a private
            key and cannot move your funds — signing in only proves you control this
            address. Profile details below are still saved on this device only;
            syncing them across devices is coming.
          </span>
        </div>

      </div>
    </div>
  )
}
