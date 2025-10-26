import React, { useEffect, useState } from 'react'
import { Heart, MoreHorizontal, Share2, Check } from 'lucide-react'
import ImageWithFallback from '../../../shared/components/ImageWithFallback'
import { useTheme } from '../../../shared/context/ThemeProvider'
import './feedcard.mobile.scss'

export default function FeedCard({ article, highlighted = false, onOpen, globalIndex, hideMeta = false }) {
	const { theme } = useTheme()
	const [menuOpen, setMenuOpen] = useState(false)
	const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
	const [copiedMsg, setCopiedMsg] = useState('')
	const [shareAck, setShareAck] = useState(false)
	const hasColor = Boolean(article?.bgColor || article?.bgColorDark)
	const cardStyle = {}
	if (hasColor) {
		cardStyle.background = theme === 'dark' ? (article.bgColorDark || article.bgColor) : (article.bgColor || article.bgColorDark)
		cardStyle.border = '1px solid var(--border)'
	}
	const icons = Array.isArray(article.favicons) ? article.favicons : []
	const maxIcons = 5

	function pickCardColor() {
		const c = theme === 'dark' ? (article?.bgColorDark || article?.bgColor) : (article?.bgColor || article?.bgColorDark)
		return (typeof c === 'string' && c) ? c : null
	}

	function hexToRgb(hex) {
		try {
			const s = hex.replace('#','')
			const v = s.length === 3 ? s.split('').map(ch=>ch+ch).join('') : s
			const num = parseInt(v, 16)
			return { r: (num>>16)&255, g: (num>>8)&255, b: num&255 }
		} catch { return null }
	}

	function getTextColorForBg(hex) {
		const rgb = hexToRgb(hex||'')
		if (!rgb) return '#ffffff'
		// Relative luminance
		const toLin = (c)=>{
			c/=255; return c<=0.03928? c/12.92 : Math.pow((c+0.055)/1.055,2.4)
		}
		const L = 0.2126*toLin(rgb.r)+0.7152*toLin(rgb.g)+0.0722*toLin(rgb.b)
		return L > 0.6 ? '#111827' : '#ffffff'
	}

	function formatRelativeTime(iso) {
		try {
			const d = new Date(iso)
			if (isNaN(d.getTime())) return ''
			const diffMs = Date.now() - d.getTime()
			const s = Math.max(0, Math.floor(diffMs / 1000))
			const m = Math.floor(s / 60)
			const h = Math.floor(m / 60)
			const dys = Math.floor(h / 24)
			if (dys > 0) return dys === 1 ? '1 day ago' : `${dys} days ago`
			if (h > 0) return h === 1 ? '1 hour ago' : `${h} hours ago`
			if (m > 0) return m === 1 ? '1 min ago' : `${m} mins ago`
			return 'just now'
		} catch { return '' }
	}

	// Prepare truncated description with remaining words count suffix
	const MAX_DESC = 420
	const descDisplay = (() => {
		const d = article.description
		if (!d) return ''
		if (d.length > MAX_DESC) {
			const sliced = d.slice(0, MAX_DESC).trimEnd()
			const rest = d.slice(MAX_DESC).trim()
			const remainingWords = rest ? rest.split(/\s+/).filter(Boolean).length : 0
			return `${sliced}… +${remainingWords}`
		}
		return d
	})()

	const onMore = (e) => {
		e.stopPropagation()
		try {
			const rect = e.currentTarget.getBoundingClientRect()
			const menuWidth = 240
			const menuHeightGuess = 200
			const margin = 8
			let top = rect.bottom + margin
			let left = rect.right - menuWidth
			const maxLeft = window.innerWidth - menuWidth - margin
			if (left > maxLeft) left = maxLeft
			if (left < margin) left = margin
			if (top + menuHeightGuess > window.innerHeight - margin) top = Math.max(margin, rect.top - menuHeightGuess - margin)
			setMenuPos({ top, left })
		} catch {
			setMenuPos({ top: 80, left: 20 })
		}
		setMenuOpen(true)
	}
	const onCloseMenu = () => setMenuOpen(false)

	const tryCopy = async (text) => {
		try {
			await navigator.clipboard.writeText(text)
		} catch {
			const ta = document.createElement('textarea')
			ta.value = text
			ta.setAttribute('readonly', '')
			ta.style.position = 'absolute'
			ta.style.left = '-9999px'
			document.body.appendChild(ta)
			ta.select()
			try { document.execCommand('copy') } catch {}
			document.body.removeChild(ta)
		}
	}

	const onShare = async (e) => {
		e.stopPropagation()
		const title = article?.title || 'Article'
		const indexUrl = article?.idNumber ? `${window.location.origin}/card${article.idNumber}` : `${window.location.origin}/article/${encodeURIComponent(title)}`
		try {
			// Always copy title + URL and acknowledge
			await tryCopy(`${title}\n${indexUrl}`)
			setCopiedMsg('Title and link copied.')
			setTimeout(() => setCopiedMsg(''), 3000)
			setShareAck(true)
			setTimeout(() => setShareAck(false), 2000)
			// Attempt native share as well (optional)
			try {
				if (navigator.share) {
					await navigator.share({ title, text: `${title}`, url: indexUrl })
				}
			} catch {}
		} catch {}
	}
	const onCopyTitle = (e) => {
		e.stopPropagation()
		tryCopy(article?.title || '')
		setMenuOpen(false)
		setCopiedMsg('Title copied')
		setTimeout(() => setCopiedMsg(''), 3000)
	}
	const onCopyFull = (e) => {
		e.stopPropagation()
		const full = `${article?.title || ''}${article?.description ? '\n\n' + article.description : ''}`
		tryCopy(full)
		setMenuOpen(false)
		setCopiedMsg('Full text copied')
		setTimeout(() => setCopiedMsg(''), 3000)
	}

	const onOpenClick = (e) => {
		e.stopPropagation()
		if (typeof onOpen === 'function') onOpen()
	}

	const [liked, setLiked] = useState(false)
	useEffect(() => {
		try {
			const key = `liked:${article?.id || article?.title || ''}`
			const v = localStorage.getItem(key)
			setLiked(v === '1')
		} catch {}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [article?.id, article?.title])

	const onLike = (e) => {
		e.stopPropagation()
		setLiked(prev => {
			const next = !prev
			try {
				const key = `liked:${article?.id || article?.title || ''}`
				const uid = (function(){ try { return localStorage.getItem('uid') || '' } catch { return '' } })()
				const sid = (function(){ try { return sessionStorage.getItem('sid') || '' } catch { return '' } })()
				const payload = { idNumber: article?.idNumber || null, title: article?.title || null, clientTs: new Date().toISOString() }
				if (next) {
					localStorage.setItem(key, '1')
					fetch('/api/user/like', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-uid': uid, 'x-sid': sid }, body: JSON.stringify(payload) }).catch(()=>{})
				} else {
					localStorage.removeItem(key)
					fetch('/api/user/unlike', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-uid': uid, 'x-sid': sid }, body: JSON.stringify(payload) }).catch(()=>{})
				}
				// legacy analytics file event (kept)
				fetch('/api/analytics/events', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ event: next ? 'like' : 'unlike', id: article?.id || article?.title, ts: Date.now() })
				}).catch(()=>{})
			} catch {}
			return next
		})
	}

	return (
		<>
			<article className={`feed-card card ${hasColor ? 'has-color' : ''} ${highlighted ? 'highlighted' : ''}`} style={cardStyle}>
				<div className="hero-wrap">
					<ImageWithFallback 
						src={article.image} 
						alt="" 
						className="hero" 
						style={{ height: 220 }} 
						width={414} 
						height={220} 
						priority={globalIndex <= 1} 
						loading={globalIndex <= 1 ? 'eager' : 'lazy'}
						fetchpriority={globalIndex === 0 ? 'high' : globalIndex <= 1 ? 'high' : 'auto'}
						onClick={onOpenClick} 
						role="button" 
						tabIndex={0} 
					/>
					{article.publishedAt && (
						<div className="age-badge" aria-label="Published age" style={{ background: pickCardColor() || undefined, color: getTextColorForBg(pickCardColor()||'') }}>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
								<path d="M12 8v4l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
								<circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" fill="none"/>
							</svg>
							{formatRelativeTime(article.publishedAt)}
						</div>
					)}
				</div>
				<div className="content">
					<h3 onClick={onOpenClick} role="button" tabIndex={0}>{article.title}</h3>
					<div className="divider" onClick={onOpenClick} role="button" tabIndex={0} />
					{article.description && <p className="description" onClick={onOpenClick} role="button" tabIndex={0}>{descDisplay}</p>}
					{!hideMeta && (
						<div className="meta">
							<div className="meta-left">
								{article.idNumber && (
									<span className="card-number">#{article.idNumber}</span>
								)}
								{icons.length > 0 && (
									<div className="favicons-row">
																{icons.slice(0, maxIcons).map((src, idx) => {
																	const u = (()=>{
																		try {
																			const s = String(src || '')
																			const isHttp = /^https?:\/\//i.test(s)
																			if (isHttp) { const enc = encodeURIComponent(s); return `/img?u=${enc}&w=64` }
																			return s
																		} catch { return src }
																	})()
																	return (<img key={idx} src={u} alt="" className="favicon" width={18} height={18} loading="lazy" decoding="async" />)
																})}
									</div>
								)}
								<span className="sources-label">{article.sources} sources</span>
							</div>
							<div className="actions">
								{hasColor ? (
									<>
										<button aria-label="Like" className={`icon-btn icon-btn--ghost ${liked ? 'liked' : ''}`} aria-pressed={liked} onClick={onLike}><Heart size={18} fill={liked ? '#ffffff' : 'none'} /></button>
										<button aria-label="Share" className="icon-btn icon-btn--ghost" onClick={onShare}>{shareAck ? <Check size={18} /> : <Share2 size={18} />}</button>
										<button aria-label="More" className="icon-btn icon-btn--ghost" onClick={onMore}><MoreHorizontal size={18} /></button>
									</>
								) : (
									<>
										<button aria-label="Like" className={`icon-btn ${liked ? 'liked' : ''}`} aria-pressed={liked} onClick={onLike}><Heart size={18} fill={liked ? '#ffffff' : 'none'} /></button>
										<button aria-label="Share" className="icon-btn" onClick={onShare}>{shareAck ? <Check size={18} /> : <Share2 size={18} />}</button>
										<button aria-label="More" className="icon-btn" onClick={onMore}><MoreHorizontal size={18} /></button>
									</>
								)}
							</div>
						</div>
					)}
				</div>
			</article>
				{menuOpen && (
					<div className="more-menu-overlay" onClick={onCloseMenu} role="dialog" aria-modal="true">
						<div className="more-menu anchored" style={{ top: menuPos.top, left: menuPos.left }} onClick={(e) => e.stopPropagation()}>
							<button className="menu-item" onClick={(e)=>{ e.stopPropagation(); onOpenClick(e); onCloseMenu() }}>Open</button>
							<button className="menu-item" onClick={(e)=>{ e.stopPropagation(); onLike(e); onCloseMenu() }}>{liked ? 'Unlike' : 'Like'}</button>
							<button className="menu-item" onClick={(e)=>{ e.stopPropagation(); onShare(e); onCloseMenu() }}>Share</button>
							<div className="menu-sep" />
							<button className="menu-item" onClick={onCopyTitle}>Copy title</button>
							<button className="menu-item" onClick={onCopyFull}>Copy full text</button>
						</div>
					</div>
				)}
				{copiedMsg && (
					<div className="copy-toast" role="status" aria-live="polite">{copiedMsg}</div>
				)}
			</>
		)
} 