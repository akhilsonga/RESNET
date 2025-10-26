import React, { useState } from 'react'

const DEFAULT_PLACEHOLDER = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><rect width="100%" height="100%" fill="%23edf2f7"/></svg>'

function isExternal(url) {
	try { const u = new URL(url); return u.protocol === 'http:' || u.protocol === 'https:' } catch { return false }
}

function toProxy(src, width) {
	if (!src) return src
	if (!isExternal(src)) return src
	const w = Math.max(64, Math.min(1920, Number(width) || 800))
	const enc = encodeURIComponent(src)
	return `/img?u=${enc}&w=${w}`
}

function buildSrcSet(src, widths = [414, 768, 1024]) {
	if (!src) return undefined
	return widths.map(w => `${toProxy(src, w)} ${w}w`).join(', ')
}

export default function ImageWithFallback({ src, alt = '', className = '', style, width, height, priority = false, loading, fetchpriority, useProxy = true, sizes = '(max-width: 420px) 414px, (max-width: 800px) 768px, 1024px', ...rest }) {
	const [errored, setErrored] = useState(false)
	const [loaded, setLoaded] = useState(false)
	const effectiveSrc = src || DEFAULT_PLACEHOLDER
	const finalSrc = useProxy ? toProxy(effectiveSrc, width || (style?.width || 800)) : effectiveSrc
	const srcSet = useProxy && isExternal(effectiveSrc) ? buildSrcSet(effectiveSrc) : undefined
	const loadingAttr = loading || (priority ? 'eager' : 'lazy')
	const fetchpriorityAttr = fetchpriority || (priority ? 'high' : 'auto')
	
	return (
		<div style={{ position: 'relative', ...style }} className={className} {...rest}>
			{!loaded && (
				<div style={{ position: 'absolute', inset: 0, background: '#edf2f7' }} aria-hidden="true" />
			)}
			{!errored ? (
				<img
					src={finalSrc}
					alt={alt}
					loading={loadingAttr}
					decoding="async"
					fetchpriority={fetchpriorityAttr}
					width={width}
					height={height}
					srcSet={srcSet}
					sizes={srcSet ? sizes : undefined}
					onLoad={() => setLoaded(true)}
					onError={() => { setErrored(true); setLoaded(true) }}
					style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: loaded ? 1 : 0, transition: 'opacity .2s ease' }}
				/>
			) : (
				<div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: '#e5e7eb', color: '#64748b' }}>
					<span>Image unavailable</span>
				</div>
			)}
		</div>
	)
} 