import React, { useEffect, Suspense, lazy } from 'react'
import { useResponsive } from '../shared/hooks/useResponsive'
import { ThemeProvider } from '../shared/context/ThemeProvider'
import { initAnalytics, subscribeToPushIfPossible } from '../shared/utils/analytics'

const MobileApp = lazy(() => import('../views/mobile/MobileApp'))
const DesktopApp = lazy(() => import('../views/desktop/DesktopApp'))

export default function App() {
	const { isMobile } = useResponsive()
	useEffect(() => {
		const start = () => {
			const a = initAnalytics()
			// If user already granted notifications, ensure push subscription exists
			try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') subscribeToPushIfPossible() } catch {}
			return () => a?.end?.()
		}
		let cleanup = null
		// Defer analytics even more - wait for page to fully load
		const timer = setTimeout(() => {
			if ('requestIdleCallback' in window) {
				requestIdleCallback(() => { cleanup = start() })
			} else {
				cleanup = start()
			}
		}, 2000) // Wait 2 seconds after component mount
		return () => { 
			clearTimeout(timer)
			cleanup?.() 
		}
	}, [])
	return (
		<ThemeProvider>
			<Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
				{isMobile ? <MobileApp /> : <DesktopApp />}
			</Suspense>
		</ThemeProvider>
	)
} 