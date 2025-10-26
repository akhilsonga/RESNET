import React from 'react'
import { useTheme } from '../../../shared/context/ThemeProvider'
import { subscribeToPushIfPossible } from '../../../shared/utils/analytics'
import { getOrCreateUserId } from '../../../shared/utils/userId'

export default function AppHeader() {
	const [userName, setUserName] = React.useState('')
	const [userPic, setUserPic] = React.useState('')
	const [isAuthenticated, setIsAuthenticated] = React.useState(false)
	const { theme, toggle } = useTheme()
	const [menuOpen, setMenuOpen] = React.useState(false)
	const [menuPos, setMenuPos] = React.useState({ top: 0, right: 0 })
	const [showFeedback, setShowFeedback] = React.useState(false)
	const [showRequest, setShowRequest] = React.useState(false)
	const [textSize, setTextSize] = React.useState(() => {
        try { return Number(localStorage.getItem('textSize')) || 14 } catch { return 14 }
    })
	const [notificationsEnabled, setNotificationsEnabled] = React.useState(() => {
        try { return localStorage.getItem('notificationsEnabled') === '1' } catch { return false }
    })
	const feedbackRef = React.useRef(null)
	const requestRef = React.useRef(null)

	React.useEffect(() => {
		(async () => {
			try {
				const r = await fetch('/api/user/me', { credentials: 'same-origin', cache: 'no-store' })
				if (r.ok) {
					const d = await r.json().catch(()=>null)
					if (d && d.ok && d.user && (d.user.email || d.user.name)) {
						setIsAuthenticated(true)
						setUserName(d.user.name || '')
						setUserPic(d.user.picture || '')
					}
				}
			} catch {}
		})()
	}, [])

	React.useEffect(() => {
		try {
			document.documentElement.style.setProperty('--desktop-text-size', textSize + 'px')
			localStorage.setItem('textSize', String(textSize))
		} catch {}
	}, [textSize])

	React.useEffect(() => {
		(async () => {
			try {
				if (notificationsEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
					await subscribeToPushIfPossible()
					fetch('/api/notifications/enable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: getOrCreateUserId() }) })
				}
			} catch {}
		})()
	}, [notificationsEnabled])

	function launchGoogleOAuth() {
		try {
			const params = new URLSearchParams()
			const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
			const redirectUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI || (window.location.origin + '/auth/callback')
			params.set('client_id', clientId)
			params.set('redirect_uri', redirectUri)
			params.set('response_type', 'code')
			params.set('scope', 'openid email profile')
			params.set('include_granted_scopes', 'true')
			params.set('prompt', 'select_account')
			const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
			window.location.assign(url)
		} catch {}
	}

	function onToggleMenu(e) {
		e?.stopPropagation?.()
		try {
			const rect = e.currentTarget.getBoundingClientRect()
			setMenuPos({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) })
		} catch { setMenuPos({ top: 56, right: 16 }) }
		setMenuOpen(v => !v)
	}

	React.useEffect(() => {
		const onDoc = () => setMenuOpen(false)
		document.addEventListener('click', onDoc)
		return () => document.removeEventListener('click', onDoc)
	}, [])

	async function onToggleNotifications() {
		try {
			if (!('Notification' in window)) return
			let perm = Notification.permission
			if (perm === 'default') perm = await Notification.requestPermission()
			if (perm === 'granted') {
				setNotificationsEnabled(true)
				try { localStorage.setItem('notificationsEnabled', '1') } catch {}
				await subscribeToPushIfPossible()
			} else {
				setNotificationsEnabled(false)
				try { localStorage.removeItem('notificationsEnabled') } catch {}
			}
		} catch {}
	}

	function onChangeTextSize(delta) {
		setTextSize(prev => {
			const next = Math.max(12, Math.min(20, prev + delta))
			return next
		})
	}

	async function submitFeedback(kind) {
		try {
			const text = kind === 'feedback' ? (feedbackRef.current?.value || '').trim() : (requestRef.current?.value || '').trim()
			if (!text) return
			const path = kind === 'feedback' ? '/api/feedback' : '/api/requests'
			await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: getOrCreateUserId(), text, ts: new Date().toISOString() }) })
			if (kind === 'feedback') { setShowFeedback(false); if (feedbackRef.current) feedbackRef.current.value = '' }
			else { setShowRequest(false); if (requestRef.current) requestRef.current.value = '' }
			alert('Thanks! We received it.')
		} catch {}
	}

    return (
        <header className="d-header">
            <div className="d-header-left">
                <div className="brand">Discover</div>
            </div>
            {!isAuthenticated && (
                <div className="d-header-center">
                    <button className="d-login" aria-label="Login" onClick={launchGoogleOAuth}>
                        Login with Google
                        <svg className="g-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 48 48" style={{ marginLeft: 8 }} aria-hidden="true" focusable="false">
                            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.674 32.91 29.223 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.869 6.053 29.7 4 24 4 12.954 4 4 12.954 4 24s8.954 20 20 20c10.493 0 19.128-7.652 19.128-20 0-1.341-.144-2.651-.417-3.917z"/>
                            <path fill="#FF3D00" d="M6.306 14.691l6.571 4.818C14.4 16.174 18.83 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.869 6.053 29.7 4 24 4 15.317 4 7.986 8.937 6.306 14.691z"/>
                            <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.191l-6.185-5.236C29.21 35.538 26.757 36 24 36c-5.202 0-9.636-3.068-11.287-7.407l-6.57 5.058C8.78 39.036 15.83 44 24 44z"/>
                            <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303C34.91 30.861 30.083 36 24 36c-5.202 0-9.636-3.068-11.287-7.407l-6.57 5.058C8.78 39.036 15.83 44 24 44c10.493 0 19.128-7.652 19.128-20 0-1.341-.144-2.651-.417-3.917z"/>
                        </svg>
                    </button>
                </div>
            )}
            <div className="d-header-right">
                <input className="d-search" placeholder="Search…" />
                <div className="d-actions">
                    <button className="icon-btn" aria-label="Settings" onClick={onToggleMenu} title="Settings">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="2"/>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09c.7 0 1.3-.4 1.51-1a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06c.46.46 1.13.6 1.72.39.58-.2 1-.77 1-1.4V3a2 2 0 1 1 4 0v.09c0 .63.42 1.2 1 1.4.6.21 1.26.07 1.72-.39l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06c-.46.46-.6 1.13-.39 1.72.2.58.77 1 1.4 1H21a2 2 0 1 1 0 4h-.09c-.63 0-1.2.42-1.51 1Z" stroke="currentColor" strokeWidth="2"/>
                        </svg>
                    </button>
                    {isAuthenticated ? (
                        <div className="d-avatar" title={userName} aria-label="User avatar" style={userPic ? { backgroundImage: `url(${userPic})` } : undefined} />
                    ) : null}
                </div>
            </div>
            {menuOpen && (
                <div className="d-menu" role="menu" style={{ top: menuPos.top, right: menuPos.right }} onClick={(e)=>e.stopPropagation()}>
                    <div className="d-menu-group" aria-label="Quick">
                        <button className="d-menu-item" onClick={()=>alert('Open Saved list (coming soon)')}>Saved</button>
                        <button className="d-menu-item" onClick={()=>alert('Open Liked list (coming soon)')}>Liked</button>
                    </div>
                    <div className="d-menu-sep" />
                    <div className="d-menu-group" aria-label="Appearance">
                        <button className="d-menu-item" onClick={toggle}>Theme: {theme === 'dark' ? 'Dark' : 'Light'}</button>
                        <div className="d-menu-row">
                            <span className="d-menu-label">Text size</span>
                            <div className="d-menu-controls">
                                <button className="chip" onClick={()=>onChangeTextSize(-1)} aria-label="Smaller">A-</button>
                                <span className="d-menu-value">{textSize}px</span>
                                <button className="chip" onClick={()=>onChangeTextSize(1)} aria-label="Larger">A+</button>
                            </div>
                        </div>
                    </div>
                    <div className="d-menu-sep" />
                    <div className="d-menu-group" aria-label="Engagement">
                        <button className="d-menu-item" onClick={onToggleNotifications}>{notificationsEnabled ? 'Disable' : 'Enable'} notifications</button>
                        <button className="d-menu-item" onClick={()=>setShowRequest(true)}>Request a topic</button>
                        <button className="d-menu-item" onClick={()=>setShowFeedback(true)}>Send feedback</button>
                        <button className="d-menu-item" onClick={()=>alert('Quiz (coming soon)')}>Quiz</button>
                    </div>
                    <div className="d-menu-sep" />
                    <div className="d-menu-group" aria-label="More">
                        <button className="d-menu-item" onClick={()=>window.open('https://resnet.in/about','_blank')}>About us</button>
                        <button className="d-menu-item" onClick={()=>window.open('https://newui.resnet.in','_blank')}>Rate us</button>
                        <button className="d-menu-item" onClick={()=>{
                            try { navigator.clipboard.writeText(window.location.origin) } catch {}
                            alert('Invite link copied!')
                        }}>Invite friends</button>
						<button className="d-menu-item" onClick={()=>{ try { document.cookie = 'hasAuth=; Max-Age=0; Path=/'; } catch {} window.location.reload() }}>Logout</button>
                    </div>
                </div>
            )}

            {showFeedback && (
                <div className="d-modal-overlay" role="dialog" aria-modal="true" onClick={()=>setShowFeedback(false)}>
                    <div className="d-modal" onClick={(e)=>e.stopPropagation()}>
                        <h3 className="d-modal-title">Send feedback</h3>
                        <textarea className="d-modal-textarea" placeholder="Your feedback" ref={feedbackRef} rows={5} />
                        <div className="d-modal-actions">
                            <button className="d-btn" onClick={()=>setShowFeedback(false)}>Cancel</button>
                            <button className="d-btn d-btn--primary" onClick={()=>submitFeedback('feedback')}>Send</button>
                        </div>
                    </div>
                </div>
            )}

            {showRequest && (
                <div className="d-modal-overlay" role="dialog" aria-modal="true" onClick={()=>setShowRequest(false)}>
                    <div className="d-modal" onClick={(e)=>e.stopPropagation()}>
                        <h3 className="d-modal-title">Request a topic</h3>
                        <textarea className="d-modal-textarea" placeholder="What would you like to see more of?" ref={requestRef} rows={5} />
                        <div className="d-modal-actions">
                            <button className="d-btn" onClick={()=>setShowRequest(false)}>Cancel</button>
                            <button className="d-btn d-btn--primary" onClick={()=>submitFeedback('request')}>Submit</button>
                        </div>
                    </div>
                </div>
            )}
        </header>
    )
}

