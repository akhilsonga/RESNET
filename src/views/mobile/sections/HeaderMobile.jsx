import React from 'react'
import { ArrowLeft, Search, RotateCcw, Settings, LogIn } from 'lucide-react'
import './header.mobile.scss'
import { useTheme } from '../../../shared/context/ThemeProvider'
import { getOrCreateUserId } from '../../../shared/utils/userId'
import InstallModal from './InstallModal'
import { subscribeToPushIfPossible, pingServerPushDemo } from '../../../shared/utils/analytics'
import SettingsOverlay from './SettingsOverlay'

function absoluteIcon(path = '/space-shuttle.png') {
	try { return new URL(path, window.location.origin).toString() } catch { return path }
}

function launchGoogleOAuth() {
	try {
		const params = new URLSearchParams()
		const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
		const redirectUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI || window.location.origin + '/auth/callback'
		const scope = 'openid email profile'
		params.set('client_id', clientId)
		params.set('redirect_uri', redirectUri)
		params.set('response_type', 'code')
		params.set('scope', scope)
		params.set('include_granted_scopes', 'true')
		params.set('prompt', 'select_account')
		const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
		window.location.assign(url)
	} catch {}
}

function toProxy(src, w = 512) {
	try {
		if (!src) return null
		const u = new URL(src)
		if (u.protocol === 'http:' || u.protocol === 'https:') {
			return `/img?u=${encodeURIComponent(src)}&w=${w}`
		}
		return src
	} catch { return src }
}

function isIOS() {
	try {
		const ua = navigator.userAgent || ''
		const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
		return iOS
	} catch { return false }
}

export default function HeaderMobile({ title, onResetFeed, onOpenSearch, onToggleSections, onOpenFavorites, isFavorites = false, topItem = null }) {
	const { theme, toggle } = useTheme()
	const [isSettingsOpen, setIsSettingsOpen] = React.useState(false)
	const [notificationsEnabled, setNotificationsEnabled] = React.useState(false)
	const [deferredPrompt, setDeferredPrompt] = React.useState(null)
	const [showInstallModal, setShowInstallModal] = React.useState(false)
	const [toast, setToast] = React.useState('')
	const uidRef = React.useRef(null)
	const [userName, setUserName] = React.useState('')
	const [showWelcome, setShowWelcome] = React.useState(false)
	const [isAuthenticated, setIsAuthenticated] = React.useState(false)
	const [userPic, setUserPic] = React.useState('')

	React.useEffect(() => {
		uidRef.current = getOrCreateUserId()
		try {
			const stored = localStorage.getItem('notificationsEnabled')
			if (stored === '1') setNotificationsEnabled(true)
		} catch {}
		// Decide if we should show welcome name: on reload or after auth callback
		let shouldWelcome = false
		try {
			const navs = performance.getEntriesByType && performance.getEntriesByType('navigation')
			if (navs && navs[0] && navs[0].type === 'reload') shouldWelcome = true
		} catch {}
		try {
			const params = new URLSearchParams(window.location.search)
			if (params.get('auth') === 'ok') shouldWelcome = true
		} catch {}
		;(async () => {
			try {
				const r = await fetch('/api/user/me', { credentials: 'same-origin', cache: 'no-store' })
				if (r.ok) {
					const d = await r.json().catch(()=>null)
					if (d && d.ok && d.user && (d.user.email || d.user.name)) {
						setIsAuthenticated(true)
						const name = (d.user.name) ? String(d.user.name) : ''
						if (name) {
							setUserName(name)
							if (shouldWelcome) {
								setShowWelcome(true)
								setTimeout(() => setShowWelcome(false), 5000)
							}
						}
						if (d.user && d.user.picture) {
							setUserPic(String(d.user.picture))
						}
					} else {
						setIsAuthenticated(false)
					}
				} else {
					setIsAuthenticated(false)
				}
			} catch {
				setIsAuthenticated(false)
			}
		})()
	}, [])

	React.useEffect(() => {
		function onBeforeInstallPrompt(e) {
			e.preventDefault()
			setDeferredPrompt(e)
		}
		window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
		return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
	}, [])

	React.useEffect(() => {
		(async () => {
			try {
				if (notificationsEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
					postJson('/api/notifications/enable', { uid: uidRef.current })
					await subscribeToPushIfPossible()
				}
			} catch {}
		})()
	}, [notificationsEnabled])

	const handleToggleSettings = () => setIsSettingsOpen(v => !v)
	const closeSettings = () => setIsSettingsOpen(false)

	function resetCookies() {
		try {
			// Clear all cookies
			const all = (document.cookie || '').split(';')
			for (const entry of all) {
				const name = (entry.split('=')[0] || '').trim()
				if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
			}
			// Create new uid cookie and update localStorage
			const newId = 'u_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
			try { localStorage.setItem('uid', newId) } catch {}
			document.cookie = `uid=${newId}; path=/; max-age=${60*60*24*7}`
			uidRef.current = newId
			showToast('Cookies reset')
		} catch {}
	}

	function isStandalone() {
		try { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true } catch { return false }
	}

	async function postJson(url, body) {
		try {
			await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
		} catch {}
	}

	async function showSampleNotification() {
		try {
			if (!('serviceWorker' in navigator)) return false
			if (Notification.permission !== 'granted') return false
			const reg = await navigator.serviceWorker.ready
			const articleTitle = topItem?.title || 'Update'
			const icon = absoluteIcon('/space-shuttle.png')
			await reg.showNotification('resnet News', { body: articleTitle, icon, badge: icon })
			return true
		} catch { return false }
	}

	async function requestNotificationsDirect() {
		try {
			if (!('Notification' in window)) return
			let permission = Notification.permission
			if (permission === 'default') permission = await Notification.requestPermission()
			if (permission === 'granted') {
				setNotificationsEnabled(true)
				try { localStorage.setItem('notificationsEnabled', '1') } catch {}
				postJson('/api/notifications/enable', { uid: uidRef.current })
				await subscribeToPushIfPossible()
				return true
			} else {
				setNotificationsEnabled(false)
				try { localStorage.removeItem('notificationsEnabled') } catch {}
				return false
			}
		} catch { return false }
	}

	const showToast = (msg) => {
		try {
			setToast(msg)
			setTimeout(() => setToast(''), 1500)
		} catch {}
	}

	const triggerIosServerPing = async () => {
		try {
			const articleTitle = topItem?.title || 'Update'
			await pingServerPushDemo(uidRef.current, { title: 'resnet News', body: articleTitle, icon: absoluteIcon('/space-shuttle.png') })
		} catch {}
	}

	const onNotificationsClick = async () => {
		closeSettings()
		// If not authenticated, launch OAuth immediately
		if (!isAuthenticated) {
			launchGoogleOAuth()
			return
		}
		// If authenticated but notifications not enabled, show notification enable modal
		if (!notificationsEnabled) {
			setShowInstallModal(true)
			return
		}
		// Otherwise, trigger a test notification
		await subscribeToPushIfPossible()
		await triggerIosServerPing()
		const ok = await showSampleNotification()
		if (isIOS() && !ok) showToast('Notification scheduled. Check when app is backgrounded.')
		postJson('/api/notifications/sample', { uid: uidRef.current, top: topItem })
	}

	const handleInstallClick = async () => {
		try {
			if (!deferredPrompt) return
			await deferredPrompt.prompt()
			await deferredPrompt.userChoice
			setDeferredPrompt(null)
		} catch {}
	}

	const handleEnableClick = async () => {
		const ok = await requestNotificationsDirect()
		if (ok) {
			setShowInstallModal(false)
			// Ensure subscription then send demo push
			await subscribeToPushIfPossible()
			await triggerIosServerPing()
			const shown = await showSampleNotification()
			if (isIOS() && !shown) showToast('Notification scheduled. Check when app is backgrounded.')
		}
	}

	const handleLoginClick = () => {
		launchGoogleOAuth()
	}

	return (
		<header className="m-header">
			<button className="icon-btn" aria-label="Back"><ArrowLeft size={18} /></button>
			<h1>{showWelcome && userName ? userName.slice(0, 12) : title}</h1>
			<div className="actions">
				{isAuthenticated ? (
					<div className="avatar icon-btn" aria-label="User avatar" style={userPic ? { backgroundImage: `url(${toProxy(userPic, 64)})` } : undefined} />
				) : (
					<button className="icon-btn pulse-login" aria-label="Login" onClick={handleLoginClick}><LogIn size={18} /></button>
				)}
				<button className="icon-btn" aria-label="Search" onClick={() => { closeSettings(); onOpenSearch?.() }}><Search size={18} /></button>
				<button className="icon-btn" aria-label="Restart feed" onClick={() => { closeSettings(); onResetFeed?.() }}><RotateCcw size={18} /></button>
				<div className="settings-wrap">
					<button className="icon-btn" aria-haspopup="dialog" aria-expanded={isSettingsOpen} aria-label="Settings" onClick={handleToggleSettings}>
						<Settings size={18} />
					</button>
				</div>
			</div>
			{toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
			<SettingsOverlay
				open={isSettingsOpen}
				onClose={closeSettings}
				onToggleSections={() => { onToggleSections?.(); }}
				onOpenFavorites={() => { onOpenFavorites?.(); }}
				onToggleTheme={() => { toggle(); }}
				onResetCookies={() => { resetCookies(); }}
				onNotifications={onNotificationsClick}
				notificationsEnabled={notificationsEnabled}
				theme={theme}
				isFavorites={isFavorites}
			/>
			<InstallModal
				open={showInstallModal}
				onClose={() => setShowInstallModal(false)}
				onInstall={handleInstallClick}
				onEnable={handleEnableClick}
				onLogin={handleLoginClick}
				canInstall={Boolean(deferredPrompt) && !isIOS() && !isStandalone()}
				canEnable={true}
				isIOS={isIOS()}
				isAuthenticated={isAuthenticated}
			/>
		</header>
	)
} 