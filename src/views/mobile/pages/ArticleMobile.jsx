import React, { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ArrowLeft, Link as LinkIcon, Paperclip, SquarePlus, Share2, ArrowUp, MessageCircle, Heart as HeartIcon, Repeat2, LayoutGrid } from 'lucide-react'
import ImageWithFallback from '../../../shared/components/ImageWithFallback'
import SwipeTabs from '../../../shared/components/SwipeTabs'
import { useTheme } from '../../../shared/context/ThemeProvider'
import './article.mobile.scss'

function formatRelativeTime(iso) {
    try {
        const d = new Date(iso)
        if (isNaN(d.getTime())) return null
        const diffMs = Date.now() - d.getTime()
        const s = Math.max(0, Math.floor(diffMs / 1000))
        const m = Math.floor(s / 60)
        const h = Math.floor(m / 60)
        const days = Math.floor(h / 24)
        if (days > 0) return days === 1 ? '1 day ago' : `${days} days ago`
        if (h > 0) return h === 1 ? '1 hour ago' : `${h} hours ago`
        if (m > 0) return m === 1 ? '1 min ago' : `${m} mins ago`
        return 'just now'
    } catch { return null }
}

export default function ArticleMobile() {
	const nav = useNavigate()
	const { id } = useParams()
	const location = useLocation()
	const { theme } = useTheme()
	const initialFromState = (location.state && location.state.article) ? location.state.article : null
	const [item, setItem] = useState(initialFromState)
	const [error, setError] = useState('')
	// phased state for smooth fade: 'off' | 'on' | 'fading'
	const [tailPhase, setTailPhase] = useState('off')
	const [question, setQuestion] = useState('')
	const [newPost, setNewPost] = useState('')
	const [posts, setPosts] = useState([
		{ id: 'p1', name: 'Alex Chen', handle: '@alex', time: '2h', text: 'Love the angle on model latency. Curious how it affects agents at scale.', likes: 12, comments: 3, reposts: 1, liked: false },
		{ id: 'p2', name: 'Sana R', handle: '@sana', time: '5h', text: 'Great write-up. Would be awesome to see benchmarks with streaming enabled.', likes: 7, comments: 1, reposts: 0, liked: false },
		{ id: 'p3', name: 'Jordan', handle: '@jordan', time: '1d', text: 'Pricing drop is the real story. Opens up new use-cases for smaller teams.', likes: 28, comments: 4, reposts: 2, liked: false }
	])
	const [chainsEntities, setChainsEntities] = useState([])
	const [activeEntity, setActiveEntity] = useState('')
	const [chainsLoading, setChainsLoading] = useState(false)
	const [chainsError, setChainsError] = useState('')
	const [chainsItems, setChainsItems] = useState([])
	const PAGE_SIZE = 20
	const [chainsPage, setChainsPage] = useState(1)
	const chainsBottomRef = React.useRef(null)

	// Always scroll to top when opening an article (or switching to another article id)
	useEffect(() => {
		try {
			window.scrollTo({ top: 0, behavior: 'auto' })
		} catch {
			window.scrollTo(0, 0)
		}
	}, [id])


	// On load, highlight then smoothly fade the unread description tail
	useEffect(() => {
		if (!item?.description) return
		setTailPhase('on')
		const t1 = setTimeout(() => setTailPhase('fading'), 3000)
		const t2 = setTimeout(() => setTailPhase('off'), 3800)
		return () => { clearTimeout(t1); clearTimeout(t2) }
	}, [item?.description])

	useEffect(() => {
		// If navigated with state but lacks details (e.g., citations), fetch full item
		let isMounted = true
		const load = async () => {
			try {
				let resp
				if (id.startsWith('item')) {
					const idx = Number(id.replace('item',''))
					resp = await fetch(`/api/news/by-index?i=${idx}`)
				} else if (!isNaN(id)) {
					// Numeric ID means it's an id_number
					const idNumber = Number(id)
					resp = await fetch(`/api/news/by-id/${idNumber}`)
				} else {
					const title = decodeURIComponent(id)
					resp = await fetch(`/api/news/by-title?title=${encodeURIComponent(title)}`)
				}
				if (!resp.ok) {
					const data = await resp.json().catch(() => null)
					throw new Error(data?.error || `HTTP ${resp.status}`)
				}
				const data = await resp.json()
				if (isMounted) {
					setItem((prev) => {
						const fallbackImg = Array.isArray(data.item?.images) && data.item.images.length ? data.item.images[0] : null
						return {
							...prev,
							...data.item,
							image: data.item?.image || prev?.image || fallbackImg
						}
					})
					setError('')
				}
			} catch (e) {
				if (isMounted) setError(String(e.message || 'Failed to load'))
			}
		}
		if (!initialFromState || !initialFromState.citations) load()
		return () => { isMounted = false }
	}, [id])

	useEffect(() => {
		setChainsEntities([])
		setActiveEntity('')
		setChainsItems([])
		setChainsError('')
		setChainsPage(1)
	}, [id])

	async function fetchEntitiesForArticleId(idNum) {
		try {
			const r = await fetch(`/api/news/entities/${idNum}`)
			if (!r.ok) throw new Error(`HTTP ${r.status}`)
			const data = await r.json()
			const ents = Array.isArray(data.entities) ? data.entities : []
			setChainsEntities(ents)
			if (ents.length > 0) setActiveEntity(prev => prev || ents[0])
		} catch (e) {
			setChainsEntities([])
		}
	}

	async function fetchChainsForEntity(entity, requireId = true) {
		if (!entity) return
		setChainsLoading(true)
		setChainsError('')
		try {
			const url = `/api/chains/search?entity=${encodeURIComponent(entity)}&require_id=${requireId ? 'true' : 'false'}`
			const r = await fetch(url)
			if (!r.ok) {
				const data = await r.json().catch(() => null)
				throw new Error(data?.error || `HTTP ${r.status}`)
			}
			const data = await r.json()
			setChainsItems(Array.isArray(data.items) ? data.items : [])
			setChainsPage(1)
		} catch (e) {
			setChainsError(String(e.message || 'Failed to load chains'))
			setChainsItems([])
		} finally {
			setChainsLoading(false)
		}
	}

	function handleTabChange(idx) {
		// 0: Summary, 1: Opinion, 2: Chains
		if (idx === 2) {
			if (chainsEntities.length === 0 && !isNaN(id)) {
				fetchEntitiesForArticleId(Number(id))
			}
		}
	}

	useEffect(() => {
		if (!activeEntity) return
		fetchChainsForEntity(activeEntity, true)
	}, [activeEntity])

	// Infinite scroll sentinel for Chains
	useEffect(() => {
		const el = chainsBottomRef.current
		if (!el) return
		const onIntersect = (entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					setChainsPage((p) => {
						const total = chainsItems.length
						const shown = p * PAGE_SIZE
						if (shown >= total) return p
						return p + 1
					})
				}
			}
		}
		const io = new IntersectionObserver(onIntersect, { root: null, rootMargin: '200px', threshold: 0 })
		io.observe(el)
		return () => io.disconnect()
	}, [chainsItems])

	if (error) {
		return (
			<div className="article-mobile">
				<div className="topbar">
					<button className="icon-btn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
					<h1>Not found</h1>
					<span style={{ width: 36 }} />
				</div>
				<p style={{ padding: 16 }}>Path: {id}</p>
				<p style={{ padding: 16 }}>{error}</p>
			</div>
		)
	}

	if (!item) {
		return (
			<div className="article-mobile">
				<div className="topbar">
					<button className="icon-btn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
					<h1>Loading…</h1>
					<span style={{ width: 36 }} />
				</div>
				<p style={{ padding: 16 }}>Fetching article…</p>
			</div>
		)
	}

	const summaryContent = (
		<div>
			{item.image && <ImageWithFallback src={item.image} alt="" style={{ height: 220 }} />}
			<div className="content">
				<h2>{item.title}</h2>
				{item.description && (() => {
					const DESC_HEAD_LEN = 220
					const desc = item.description
					const head = desc.slice(0, DESC_HEAD_LEN)
					const tail = desc.slice(DESC_HEAD_LEN)
					return (
						<p className="text-muted description" style={{ marginTop: 8 }}>
							<span>{head}</span>
							{tail && (
								<span className={`desc-tail ${tailPhase === 'on' ? 'highlight' : ''} ${tailPhase === 'fading' ? 'fade' : ''}`}>{tail}</span>
							)}
						</p>
					)
				})()}
				<p className="text-muted" style={{ marginTop: 12 }}>{item.sourcesCount} sources</p>
				{Array.isArray(item.citations) && item.citations.length > 0 && (
					<div className="citations">
						<div className="citations-head">Sources & Citations</div>
						<div
							className="citations-row"
							role="list"
							onTouchStart={(e)=>e.stopPropagation()}
							onTouchMove={(e)=>e.stopPropagation()}
							onTouchEnd={(e)=>e.stopPropagation()}
						>
							{item.citations.map((c, i) => {
								const host = (() => { try { return new URL(c.url).hostname.replace(/^www\./,'') } catch { return c.url } })()
								return (
									<a key={i} className="citation-card" role="listitem" href={c.url} target="_blank" rel="noreferrer">
										<div className="citation-top">
											{c.favicon ? (
												<img src={c.favicon} alt="" className="citation-ico" />
											) : (
												<div className="citation-ico placeholder" />
											)}
											<div className="citation-title">{c.title || host}</div>
										</div>
										<div className="citation-host">{host}</div>
									</a>
								)
							})}
						</div>
					</div>
				)}
			</div>
		</div>
	)

	const opinionContent = (
		<div className="content">
			<div className="community">
				<div className="composer">
					<div className="avatar" aria-hidden="true">You</div>
					<div className="composer-main">
						<textarea
							className="composer-input"
							placeholder="Share your thoughts…"
							value={newPost}
							onChange={(e)=>setNewPost(e.target.value)}
							rows={2}
						/>
						<div className="composer-actions">
							<button className="post-btn" disabled={!newPost.trim()} onClick={() => {
								const text = newPost.trim()
								if (!text) return
								setPosts(prev => [{ id: 'p'+Date.now(), name: 'You', handle: '@you', time: 'just now', text, likes: 0, comments: 0, reposts: 0, liked: false }, ...prev])
								setNewPost('')
							}}>Post</button>
						</div>
					</div>
				</div>

				<div className="thread" role="list">
					{posts.map((p) => (
						<article key={p.id} className="post-card" role="listitem">
							<div className="post-meta">
								<div className="avatar" aria-hidden="true">{(p.name||'U').slice(0,2)}</div>
								<div className="who">
									<div className="name-line">
										<strong className="name">{p.name}</strong>
										<span className="handle">{p.handle}</span>
										<span className="dot">·</span>
										<span className="time">{p.time}</span>
									</div>
									<div className="post-text">{p.text}</div>
								</div>
							</div>
							<div className="post-actions">
								<button className="icon-text" aria-label="Comment"><MessageCircle size={16} /> <span>{p.comments ?? 0}</span></button>
								<button className={`icon-text ${p.liked ? 'liked' : ''}`} aria-label="Like" onClick={() => {
									setPosts(prev => prev.map(x => x.id === p.id ? { ...x, liked: !x.liked, likes: (x.likes||0) + (x.liked ? -1 : 1) } : x))
								}}><HeartIcon size={16} /> <span>{p.likes ?? 0}</span></button>
								<button className="icon-text" aria-label="Repost"><Repeat2 size={16} /> <span>{p.reposts ?? 0}</span></button>
								<button className="icon-text" aria-label="Share"><Share2 size={16} /></button>
							</div>
						</article>
					))}
				</div>
			</div>
		</div>
	)

	const chainsContent = (
		<div>
			{chainsEntities.length > 0 && (
				<div style={{ padding: '8px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
					{chainsEntities.map((e) => (
						<button
							key={e}
							className={`chip ${activeEntity === e ? 'active' : ''}`}
							onClick={() => setActiveEntity(e)}
							style={{
								padding: '6px 10px',
								borderRadius: 999,
								border: '1px solid #ddd',
								background: activeEntity === e ? (item.bgColor || item.bgColorDark || '#222') : 'transparent',
								color: activeEntity === e ? '#fff' : 'inherit'
							}}
						>
							{e}
						</button>
					))}
				</div>
			)}
			<div className="content">
				{chainsLoading && <p className="text-muted">Loading…</p>}
				{chainsError && !chainsLoading && <p className="text-muted">{chainsError}</p>}
				{!chainsLoading && chainsItems.length === 0 && !chainsError && <p className="text-muted">No results.</p>}
			</div>
			<div className="feed-list" role="list">
					{chainsItems.slice(0, chainsPage * PAGE_SIZE).map((c, i) => {
					const hero = Array.isArray(c.images) && c.images.length ? c.images[0] : (Array.isArray(c.image_url) && c.image_url.length ? c.image_url[0] : null)
						const hasColor = Boolean(c.bgColor || c.bgColorDark)
						const cardBg = hasColor
							? (theme === 'dark' ? (c.bgColorDark || c.bgColor) : (c.bgColor || c.bgColorDark))
							: undefined
						const cardClass = `feed-card card ${hasColor ? 'has-color' : ''}`
						return (
							<article key={i} className={cardClass} role="listitem" style={{ background: cardBg, border: '1px solid var(--border)' }}>
								{hero && (
									<div className="hero-wrap">
										<ImageWithFallback src={hero} alt="" className="hero" style={{ height: 220 }} />
										{c.timestamp && (
											<div className="age-badge" aria-label="Published age">
												{formatRelativeTime(c.timestamp)}
											</div>
										)}
									</div>
								)}
								<div className="content">
									<h3>{c.title || 'Untitled'}</h3>
									<div className="divider" />
									{c.description && <p className="description">{c.description}</p>}
									{Array.isArray(c.page_url) && c.page_url.length > 0 && (
										<div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
											{c.page_url.slice(0, 4).map((u, j) => (
												<a key={j} href={u} target="_blank" rel="noreferrer" className="chip" style={{ border: '1px solid #ddd', padding: '6px 10px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
													<LinkIcon size={14} /> Link {j+1}
												</a>
											))}
										</div>
									)}
								</div>
							</article>
						)
					})}
					<div ref={chainsBottomRef} />
			</div>
		</div>
	)

	const tabs = [
		{ key: 'summary', label: 'Summary', content: summaryContent },
		{ key: 'opinion', label: 'Opinion', content: opinionContent },
		{ key: 'chains', label: 'Chains', content: chainsContent }
	]

	const canSend = question.trim().length > 0
	const onSend = async () => {
		if (!canSend) return
		try {
			// Placeholder: log analytics; hook your chat backend here
			await fetch('/api/analytics/events', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ event: 'article_question', q: question, ts: Date.now() })
			}).catch(()=>{})
			setQuestion('')
		} catch {}
	}

	return (
		<div className="article-mobile">
			<div className="topbar">
				<button className="icon-btn" onClick={() => {
					try {
						if (window.history.length > 1) {
							window.history.back()
							return
						}
					} catch {}
					nav(-1)
				}} aria-label="Back"><ArrowLeft size={18} /></button>
				<h1>Article</h1>
				<span style={{ width: 36 }} />
			</div>
			<SwipeTabs tabs={tabs} initialIndex={0} activeColor={item.bgColor || item.bgColorDark || undefined} onChange={handleTabChange} />
		</div>
	)
} 