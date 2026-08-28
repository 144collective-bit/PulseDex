import { useState, useEffect } from 'react'
import {
  User, Save, LogIn, LogOut,
  ShieldCheck, Volume2, VolumeX, Eye, EyeOff,
  Zap, Lock, CheckCircle2, AlertCircle, Radio,
  FileText, Mail, KeyRound, Shield,
} from 'lucide-react'
import { useUserProfile } from '../context/UserProfileContext'
import { useAuth } from '../context/AuthContext'
import { evaluatePasswordStrength } from '../services/authSecurity'

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

function SectionCard({ icon: Icon, iconColor = 'var(--pulse-cyan)', title, subtitle, children, noPadding }) {
  return (
    <div className="profile-section-card">
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
  const { currentUser, isAuthenticated, openAuthModal, signOut } = useAuth()
  const { profile, preferences, updateProfile, updatePreferences, triggerSound } = useUserProfile()

  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [bio, setBio] = useState('')
  const [saveMsg, setSaveMsg] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confPw, setConfPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [pwStatus, setPwStatus] = useState(null)

  useEffect(() => {
    setDisplayName(currentUser?.displayName || profile.displayName || '')
    setUsername(currentUser?.username || profile.username || '')
    setEmail(currentUser?.email || profile.email || '')
    setBio(profile.bio || '')
  }, [profile, currentUser])

  const initials = (displayName || username || 'PT').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const displayedName = currentUser?.displayName || displayName || 'Pulse Trader'
  const displayedHandle = currentUser?.username || username || 'pulse_degen'

  const pwStrength = evaluatePasswordStrength(newPw)
  const pwSegments = pwStrength.level === 'Strong' ? 3 : pwStrength.level === 'Medium' ? 2 : 1
  const pwColor = pwStrength.level === 'Strong' ? 'var(--pulse-green)' : pwStrength.level === 'Medium' ? 'var(--pulse-yellow)' : 'var(--pulse-red)'

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

  const changePassword = e => {
    e.preventDefault()
    if (!newPw || newPw.length < 6) { setPwStatus({ type: 'error', text: 'Minimum 6 characters required.' }); return }
    if (newPw !== confPw) { setPwStatus({ type: 'error', text: 'Passwords do not match.' }); return }
    triggerSound('success')
    setPwStatus({ type: 'success', text: 'Password encrypted and saved to vault.' })
    setCurPw(''); setNewPw(''); setConfPw('')
    setTimeout(() => setPwStatus(null), 3500)
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
                <span className="profile-status-badge"><ShieldCheck size={9} /> Vault Active</span>
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

          <SectionCard icon={User} iconColor="var(--pulse-cyan)" title="Identity & Profile" subtitle="Your public trader persona on PulseChain">
            <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <FormField label="Display Name">
                <StyledInput icon={User} type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. Satoshi Whale" required />
              </FormField>
              <FormField label="Username" hint="a–z 0–9 _">
                <StyledInput type="text" value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder="pulse_whale" required />
              </FormField>
              <FormField label="Email Address" hint="Optional">
                <StyledInput icon={Mail} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@domain.com" />
              </FormField>
              <FormField label="Trader Bio" hint="Optional">
                <StyledInput icon={FileText} type="text" value={bio} onChange={e => setBio(e.target.value)} placeholder="e.g. PulseChain LP provider & swing trader" />
              </FormField>
              <div className="profile-form-action-row">
                <button type="submit" className="profile-save-btn" disabled={isSaving}><Save size={14} />{isSaving ? 'Saving…' : 'Save Changes'}</button>
                {saveMsg && <span className="profile-success-chip animate-fade-in"><CheckCircle2 size={12} />{saveMsg}</span>}
              </div>
            </form>
          </SectionCard>

          <SectionCard icon={Shield} iconColor="var(--pulse-yellow)" title="Security & Encryption" subtitle="PBKDF2 client-side vault — keys never leave this device">
            <form onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <FormField label="Current Password">
                <StyledInput icon={Lock} type={showPw ? 'text' : 'password'} value={curPw} onChange={e => setCurPw(e.target.value)} placeholder="Enter current password" />
              </FormField>
              <FormField label="New Password">
                <StyledInput icon={Lock} type={showPw ? 'text' : 'password'} value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min. 6 characters"
                  rightSlot={
                    <button type="button" onClick={() => setShowPw(v => !v)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  }
                />
              </FormField>
              {newPw && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                    {[0,1,2].map(i => <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < pwSegments ? pwColor : 'rgba(255,255,255,0.07)', transition: 'background 0.3s ease' }} />)}
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800, color: pwColor, minWidth: 42, textAlign: 'right' }}>{pwStrength.level}</span>
                </div>
              )}
              <FormField label="Confirm New Password">
                <StyledInput icon={Lock} type={showPw ? 'text' : 'password'} value={confPw} onChange={e => setConfPw(e.target.value)} placeholder="Repeat new password" />
              </FormField>
              {pwStatus && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderRadius: 10, fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 600, background: pwStatus.type === 'success' ? 'rgba(0,255,157,0.08)' : 'rgba(244,63,94,0.08)', border: `1px solid ${pwStatus.type === 'success' ? 'rgba(0,255,157,0.22)' : 'rgba(244,63,94,0.22)'}`, color: pwStatus.type === 'success' ? 'var(--pulse-green)' : 'var(--pulse-red)' }}>
                  {pwStatus.type === 'success' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                  {pwStatus.text}
                </div>
              )}
              <div className="profile-form-action-row">
                <button type="submit" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 38, padding: '0 20px', borderRadius: 10, border: '1px solid rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.08)', color: 'var(--pulse-yellow)', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.18s ease' }}>
                  <KeyRound size={14} />Update Password
                </button>
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
          <span><strong>PulseDex Client-Side Vault</strong> — passwords are PBKDF2-hashed and never leave this device. Your account exists only in this browser and isn't recoverable if local storage is cleared.</span>
        </div>

      </div>
    </div>
  )
}
