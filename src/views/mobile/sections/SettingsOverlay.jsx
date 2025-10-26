import React from 'react'
import { createPortal } from 'react-dom'
import { X, Eye, Heart, LayoutGrid, Sun, Moon, RotateCcw, Bell, BellOff } from 'lucide-react'
import './settings.mobile.scss'

export default function SettingsOverlay({
	open = false,
	onClose,
	onToggleSections,
	onOpenFavorites,
	onToggleTheme,
	onResetCookies,
	onNotifications,
	notificationsEnabled = false,
	theme = 'light',
	isFavorites = false,
}) {
	const [isMounted, setIsMounted] = React.useState(false)

	React.useEffect(() => {
		setIsMounted(true)
		return () => setIsMounted(false)
	}, [])

	React.useEffect(() => {
		if (!open || !isMounted) return
		const onKeyDown = (event) => {
			if (event.key === 'Escape') {
				onClose?.()
			}
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [open, onClose, isMounted])

	React.useEffect(() => {
		if (!open || !isMounted) return
		let previous = ''
		try {
			previous = document.body.style.overflow
			document.body.style.overflow = 'hidden'
		} catch {}
		return () => {
			try { document.body.style.overflow = previous } catch {}
		}
	}, [open, isMounted])

	if (!open || !isMounted) return null

	const options = [
		{
			id: 'sections',
			title: 'Manage sections',
			description: 'Choose which sections appear in your feed.',
			icon: <Eye size={18} />,
			action: () => onToggleSections?.(),
		},
		{
			id: 'favorites',
			title: isFavorites ? 'Back to feed' : 'Open favorites',
			description: isFavorites ? 'Return to the main feed view.' : 'Jump straight to your saved stories.',
			icon: isFavorites ? <LayoutGrid size={18} /> : <Heart size={18} />,
			action: () => onOpenFavorites?.(),
		},
		{
			id: 'notifications',
			title: notificationsEnabled ? 'Notifications enabled' : 'Turn on notifications',
			description: notificationsEnabled ? 'Send a test notification or manage push settings.' : 'Enable push alerts for top stories.',
			icon: notificationsEnabled ? <Bell size={18} /> : <BellOff size={18} />,
			action: () => onNotifications?.(),
		},
		{
			id: 'appearance',
			title: 'Appearance',
			description: theme === 'dark' ? 'Switch to light theme.' : 'Switch to dark theme.',
			icon: theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />,
			action: () => onToggleTheme?.(),
		},
		{
			id: 'reset',
			title: 'Reset cookies',
			description: 'Clear saved preferences and refresh your device ID.',
			icon: <RotateCcw size={18} />,
			action: () => onResetCookies?.(),
		},
	]

	const handleClose = () => {
		onClose?.()
	}

	const handleOptionSelect = (fn) => {
		try {
			fn?.()
		} finally {
			handleClose()
		}
	}

	const portalContent = (
		<div className="settings-overlay" role="dialog" aria-modal="true" aria-label="Settings" onClick={handleClose}>
			<div className="settings-sheet" onClick={(event) => event.stopPropagation()}>
				<header className="settings-header">
					<h2>Settings</h2>
					<button className="icon-btn" aria-label="Close settings" onClick={handleClose}>
						<X size={18} />
					</button>
				</header>
				<ul className="settings-list">
					{options.map((option) => (
						<li key={option.id}>
							<button className="settings-option" onClick={() => handleOptionSelect(option.action)}>
								<span className="option-icon">{option.icon}</span>
								<span className="option-copy">
									<span className="option-title">{option.title}</span>
									<span className="option-description">{option.description}</span>
								</span>
							</button>
						</li>
					))}
				</ul>
			</div>
		</div>
	)

	return createPortal(portalContent, document.body)
}

