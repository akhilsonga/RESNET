import { useEffect, useState } from 'react'

// Simple responsive hook used by App.jsx to decide between MobileApp and DesktopApp
// Returns true for mobile (width < 768px) and false for desktop
export function useResponsive() {
	const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : true)

	useEffect(() => {
		function onResize() {
			setIsMobile(window.innerWidth < 768)
		}
		window.addEventListener('resize', onResize)
		return () => window.removeEventListener('resize', onResize)
	}, [])

	return { isMobile }
}


