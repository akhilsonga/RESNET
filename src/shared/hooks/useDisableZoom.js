import { useEffect } from 'react'

/**
 * Custom hook to disable zoom in mobile view
 * Modifies the viewport meta tag to prevent user scaling
 */
export function useDisableZoom() {
	useEffect(() => {
		const meta = document.querySelector('meta[name="viewport"]')
		if (!meta) return

		// Store the original viewport content
		const originalContent = meta.getAttribute('content') || 'width=device-width, initial-scale=1.0'
		
		// Set viewport to disable zoom
		const disableZoomContent = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'
		meta.setAttribute('content', disableZoomContent)

		// Cleanup: restore original viewport on unmount
		return () => {
			meta.setAttribute('content', originalContent)
		}
	}, [])
}
