import React, { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useDisableZoom } from '../../shared/hooks/useDisableZoom'

const DiscoverMobile = lazy(() => import('./pages/DiscoverMobile'))
const ArticleMobile = lazy(() => import('./pages/ArticleMobile'))
const Admin = lazy(() => import('./pages/Admin'))

export default function MobileApp() {
	// Disable zoom for the entire mobile app
	useDisableZoom()

	return (
		<BrowserRouter>
			<Suspense fallback={<div style={{ padding: 12 }}>Loading…</div>}>
				<Routes>
					<Route path="/" element={<DiscoverMobile />} />
					<Route path="/card:idx" element={<DiscoverMobile />} />
					<Route path="/card/:idx" element={<DiscoverMobile />} />
					<Route path="/card/:idx/*" element={<DiscoverMobile />} />
					<Route path="/article/:id" element={<ArticleMobile />} />
					<Route path="/article/item:id" element={<ArticleMobile />} />
                    <Route path="/admin" element={<Admin />} />
					<Route path="*" element={<DiscoverMobile />} />
				</Routes>
			</Suspense>
		</BrowserRouter>
	)
} 