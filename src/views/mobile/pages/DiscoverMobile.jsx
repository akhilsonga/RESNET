import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import HeaderMobile from '../sections/HeaderMobile'
import SearchOverlay from '../sections/SearchOverlay'
import CategoryChips from '../sections/CategoryChips'
import FeedCard from '../sections/FeedCard'
import { getOrCreateUserId } from '../../../shared/utils/userId'
import './discover.mobile.scss'

const CHUNK_SIZE = 6
const PREFETCH_COUNT = 1 // Only one adjacent chunk for deep linking

function readSnapshot() {
	try {
		const raw = sessionStorage.getItem('feedSnapshot')
		if (!raw) return null
		const snap = JSON.parse(raw)
		if (!snap || !Array.isArray(snap.chunks)) return null
		return snap
	} catch {
		return null
	}
}

function isExternal(url) {
	try { const u = new URL(url); return u.protocol === 'http:' || u.protocol === 'https:' } catch { return false }
}

function buildProxyUrl(src, w = 768) {
	if (!src) return null
	if (!isExternal(src)) return src
	const enc = encodeURIComponent(src)
	return `/img?u=${enc}&w=${w}`
}

function SkeletonCard() {
	return (
		<article className="skeleton-card">
			<div className="skeleton-hero" />
			<div className="skeleton-body">
				<div className="skeleton-line lg" />
				<div className="skeleton-line md" />
				<div className="skeleton-line sm" />
			</div>
		</article>
	)
}

function parseCardParam(raw) {
	if (!raw) return null
	const cleaned = String(raw).replace(/^[a-zA-Z]+/, '')
	const num = Number(cleaned)
	return Number.isFinite(num) ? num : null
}

export default function DiscoverMobile() {
	const navigate = useNavigate()
	const params = useParams()
	const location = useLocation()
	const idxParam = params?.idx || null
	let urlCardId = parseCardParam(idxParam)
	// Fallback: parse from pathname when router param is unavailable (e.g., /card5762)
	if (urlCardId == null && typeof location?.pathname === 'string') {
		try {
			const m = location.pathname.match(/\/(?:card)\/?(\d+)/i)
			if (m && m[1]) urlCardId = Number(m[1])
		} catch {}
	}
	
	const initialSnap = readSnapshot()
	const [chunks, setChunks] = useState(() => {
		if (urlCardId != null) return []
		const historyState = (() => {
			try { return window.history?.state || {} } catch { return {} }
		})()
		if (initialSnap && Array.isArray(initialSnap.chunks) && initialSnap.chunks.length) {
			if (!urlCardId && historyState?.resumeCardId) {
				const resumeId = Number(historyState.resumeCardId)
				if (Number.isFinite(resumeId)) {
					return initialSnap.chunks
				}
			}
			return initialSnap.chunks
		}
		return []
	})
	const [startChunk, setStartChunk] = useState(0)
	const [totalChunks, setTotalChunks] = useState(() => (urlCardId != null ? null : initialSnap?.totalChunks ?? null))
	const [loading, setLoading] = useState(false)
	const [empty, setEmpty] = useState(false)
	const [fullItems, setFullItems] = useState(null)
	const [scrollTargetId, setScrollTargetId] = useState(urlCardId)
	const [meta, setMeta] = useState(null) // { maxId, minId, totalItems }
	const feedListRef = useRef(null)
	const currentUrlCardRef = useRef(null)
	const uid = getOrCreateUserId()
	const [highlightId, setHighlightId] = useState(null)
	const [topCapId, setTopCapId] = useState(urlCardId ?? null)
	const [capNewerActive, setCapNewerActive] = useState(urlCardId != null)
	const [showSearch, setShowSearch] = useState(false)
	const [hideDescriptions, setHideDescriptions] = useState(false)
	const [centerCardId, setCenterCardId] = useState(urlCardId || 0)
	const [needsRedirect, setNeedsRedirect] = useState(false)
	const [showNewCardsNotice, setShowNewCardsNotice] = useState(false)
	const [favoritesMode, setFavoritesMode] = useState(false)
	const [favorites, setFavorites] = useState([]) // [{idNumber, title}]
	const [preloadedLcp, setPreloadedLcp] = useState(false)
	const bottomSentinelRef = useRef(null)
	const topSentinelRef = useRef(null)
	const lastRequestedChunkRef = useRef(null)
	const lastRequestedUpwardChunkRef = useRef(null)
	const reloadNoticeHandledRef = useRef(false)
	const wasReloadRef = useRef(false)
	const [userScrolled, setUserScrolled] = useState(urlCardId == null)

	useEffect(() => {
		if (userScrolled) return
		const markScrolled = () => {
			setUserScrolled(true)
			window.removeEventListener('wheel', markScrolled)
			window.removeEventListener('touchstart', markScrolled)
		}
		window.addEventListener('wheel', markScrolled, { passive: true })
		window.addEventListener('touchstart', markScrolled, { passive: true })
		return () => {
			window.removeEventListener('wheel', markScrolled)
			window.removeEventListener('touchstart', markScrolled)
		}
	}, [userScrolled])

	useEffect(() => {
		if (preloadedLcp) return
		const first = chunks.flatMap(ch => ch.items || []).filter(it => it?.image).sort((a,b)=> (b.idNumber||0)-(a.idNumber||0))[0]
		if (!first) return
		// Use requestIdleCallback to avoid blocking main thread
		const preloadImage = () => {
			try {
				const href = buildProxyUrl(first.image, 768)
				if (!href) return
				const link = document.createElement('link')
				link.rel = 'preload'
				link.as = 'image'
				link.href = href
				link.setAttribute('fetchpriority', 'high')
				link.setAttribute('imagesrcset', `${buildProxyUrl(first.image,414)} 414w, ${buildProxyUrl(first.image,768)} 768w, ${buildProxyUrl(first.image,1024)} 1024w`)
				link.setAttribute('imagesizes', '(max-width: 420px) 414px, (max-width: 800px) 768px, 1024px')
				document.head.appendChild(link)
				setPreloadedLcp(true)
			} catch {}
		}
		if ('requestIdleCallback' in window) {
			requestIdleCallback(preloadImage)
		} else {
			setTimeout(preloadImage, 0)
		}
	}, [chunks, preloadedLcp])

	useEffect(() => {
		try { if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual' } catch {}
		// Do not force scroll-to-top when deep-linking to a specific card
		if (urlCardId == null) {
			try { window.scrollTo({ top: 0, behavior: 'auto' }) } catch { window.scrollTo(0,0) }
		}
	}, [urlCardId])

	const saveSnapshot = () => {
		try {
			const snap = { chunks, startChunk, totalChunks, meta }
			sessionStorage.setItem('feedSnapshot', JSON.stringify(snap))
		} catch {}
	}

	const applyChunks = (data) => {
		setTotalChunks(data.totalChunks)
		setChunks(prev => {
			const map = new Map(prev.map(c => [c.chunkIndex, c]))
			for (const ch of (data.chunks || [])) {
				let items = Array.isArray(ch.items) ? ch.items : []
				// During initial deep-link render, drop any item with idNumber > topCapId
			if (capNewerActive && topCapId != null) {
					items = items.filter(it => (it && typeof it.idNumber === 'number') ? it.idNumber <= topCapId : true)
				}
				map.set(ch.chunkIndex, { ...ch, items })
			}
			return Array.from(map.values()).sort((a,b)=>a.chunkIndex-b.chunkIndex)
		})
	}

	const applyLocalChunk = (chunkIndex) => {
		if (!Array.isArray(fullItems) || fullItems.length === 0) return false
		const total = Math.ceil(fullItems.length / CHUNK_SIZE)
		setTotalChunks(total)
		if (chunkIndex >= total) return false
		const from = chunkIndex * CHUNK_SIZE
		const to = Math.min(from + CHUNK_SIZE, fullItems.length)
		const items = fullItems.slice(from, to)
		setChunks(prev => {
			const map = new Map(prev.map(c => [c.chunkIndex, c]))
			map.set(chunkIndex, { chunkIndex, items })
			return Array.from(map.values()).sort((a,b)=>a.chunkIndex-b.chunkIndex)
		})
		return true
	}

	const loadMeta = async () => {
		try {
			const sid = sessionStorage.getItem('sid') || ''
			const res = await fetch('/api/news/meta', { headers: { 'x-uid': uid, 'x-sid': sid }, cache: 'no-store' })
			if (res.ok) {
				const data = await res.json()
				setMeta(data)
				return data
			}
		} catch {}
		return null
	}

	const fallbackLoadList = async () => {
		try {
			const sid = sessionStorage.getItem('sid') || ''
			const r = await fetch('/api/news', { headers: { 'x-uid': uid, 'x-sid': sid } })
			if (!r.ok) throw new Error('list not ok')
			const d = await r.json()
			const items = Array.isArray(d.items) ? d.items : []
			if (items.length === 0) { setEmpty(true); return }
			setFullItems(items)
			const total = Math.ceil(items.length / CHUNK_SIZE)
			setTotalChunks(total)
			const start = 0
			applyLocalChunk(start)
		} catch {
			setEmpty(true)
		}
	}

	const loadChunks = async (from, retryIfEmpty = true) => {
		if (loading) return
		if (lastRequestedChunkRef.current === from) return
		lastRequestedChunkRef.current = from
		setLoading(true)
		try {
			const sid = sessionStorage.getItem('sid') || ''
			// Add timeout and priority to critical requests
			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), 8000)
			const res = await fetch(`/api/news/chunks?size=${CHUNK_SIZE}&start=${from}&count=${PREFETCH_COUNT}`, { 
				headers: { 'x-uid': uid, 'x-sid': sid }, 
				signal: controller.signal,
				priority: 'high'
			})
			clearTimeout(timeoutId)
			if (!res.ok) throw new Error('chunks not ok')
			const data = await res.json()
			if ((data.chunks?.length || 0) === 0) {
				return fallbackLoadList()
			}
			applyChunks(data)
		} catch (error) {
			console.error('loadChunks error:', error)
			return fallbackLoadList()
		} finally {
			setLoading(false)
			lastRequestedChunkRef.current = null
		}
	}

	const fetchLatestCardId = async () => {
		const data = await loadMeta()
		const latest = Number(data?.latestId ?? data?.maxId)
		return Number.isFinite(latest) ? latest : null
	}

	const readStoredCardId = () => {
		try {
			const raw = sessionStorage.getItem('resumeCardId') || null
			if (raw == null) return null
			const v = Number(raw)
			return Number.isFinite(v) ? v : null
		} catch {
			return null
		}
	}

	const rememberNoticeShownFor = (cardId) => {
		try {
			if (cardId == null) return
			sessionStorage.setItem('newCardsNoticeFor', String(cardId))
		} catch {}
	}

	const hasNoticeBeenShownFor = (cardId) => {
		try {
			if (cardId == null) return false
			const raw = sessionStorage.getItem('newCardsNoticeFor')
			return raw != null && Number(raw) === Number(cardId)
		} catch {
			return false
		}
	}

	const checkForNewCards = async (currentCardId) => {
		if (!wasReloadRef.current) return
		if (reloadNoticeHandledRef.current) return
		reloadNoticeHandledRef.current = true
		const resumeId = currentCardId ?? readStoredCardId()
		const latestId = await fetchLatestCardId()
		if (latestId == null || resumeId == null) return
		if (!hasNoticeBeenShownFor(resumeId) && latestId !== resumeId) {
			setShowNewCardsNotice(true)
		}
	}

	const loadPreviousChunk = async (chunkIndex) => {
		if (loading) return
		if (chunkIndex < 0) return
		if (lastRequestedUpwardChunkRef.current === chunkIndex) return
		lastRequestedUpwardChunkRef.current = chunkIndex
		
		// Save scroll position before loading to prevent jump
		const scrollY = window.scrollY
		const feedList = feedListRef.current
		const previousHeight = feedList?.scrollHeight || 0
		
		setLoading(true)
		try {
			const sid = sessionStorage.getItem('sid') || ''
			const res = await fetch(`/api/news/chunks?size=${CHUNK_SIZE}&start=${chunkIndex}&count=1`, { headers: { 'x-uid': uid, 'x-sid': sid } })
			if (!res.ok) throw new Error('previous chunk not ok')
			const data = await res.json()
			if ((data.chunks?.length || 0) === 0) return
			applyChunks(data)
			
			// Restore scroll position after new content is added at top
			requestAnimationFrame(() => {
				if (feedList) {
					const newHeight = feedList.scrollHeight
					const heightDiff = newHeight - previousHeight
					if (heightDiff > 0) {
						window.scrollTo(0, scrollY + heightDiff)
					}
				}
			})
		} catch (error) {
			console.error('loadPreviousChunk error:', error)
		} finally {
			setLoading(false)
			lastRequestedUpwardChunkRef.current = null
		}
	}

	const loadChunkById = async (cardId, { remember = false } = {}) => {
		setLoading(true)
		try {
			const sid = sessionStorage.getItem('sid') || ''
			// Add timeout and priority to critical requests
			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), 8000)
			const res = await fetch(`/api/news/chunk-by-id/${cardId}?size=${CHUNK_SIZE}&count=1&cap_newer=true`, { 
				headers: { 'x-uid': uid, 'x-sid': sid },
				signal: controller.signal,
				priority: 'high'
			})
			clearTimeout(timeoutId)
			if (res.status === 404) return false
			if (!res.ok) throw new Error('chunk-by-id not ok')
			const data = await res.json()
			if (!data?.chunks?.length) return false
			setChunks(data.chunks)
			setTotalChunks(data.totalChunks)
			setStartChunk(data.start)
			setScrollTargetId(cardId)
			setTopCapId(cardId)
			setEmpty(false)
			if (remember && cardId != null) {
				try { sessionStorage.setItem('lastReloadCardId', String(cardId)) } catch {}
			}
			// Client-side fallback: if requested card is not in the loaded items, synthesize a placeholder as first item
			const loadedItems = (data.chunks || []).flatMap(ch => ch.items || [])
			const hasRequested = loadedItems.some(it => it && Number(it.idNumber) === Number(cardId))
			if (!hasRequested) {
				setChunks(prev => {
					const firstChunkIdx = prev.length ? prev[0].chunkIndex : data.start || 0
					const placeholder = { id: String(cardId), idNumber: Number(cardId), title: `#${cardId}`, description: '', sourcesCount: 0, image: null, favicons: [], bgColor: null, bgColorDark: null, publishedAt: null }
					const first = { chunkIndex: firstChunkIdx, items: [placeholder, ...((prev[0]?.items)||[])] }
					const rest = prev.slice(1)
					return [first, ...rest]
				})
			}
			return true
		} catch (err) {
			console.error('loadChunkById error:', err)
			return false
		} finally {
			setLoading(false)
			lastRequestedChunkRef.current = null
		}
	}

	const dismissNewCardsNotice = () => {
		const resumeId = readStoredCardId()
		if (resumeId != null) rememberNoticeShownFor(resumeId)
		setShowNewCardsNotice(false)
	}

	const refreshForNewCards = () => {
		dismissNewCardsNotice()
		handleReset()
	}

	const handleReset = () => {
		setChunks([])
		setFullItems(null)
		setEmpty(false)
		setStartChunk(0)
		setScrollTargetId(null)
		sessionStorage.removeItem('resumeCardId')
		sessionStorage.removeItem('feedSnapshot')
		try { sessionStorage.removeItem('newCardsNoticeFor') } catch {}
		setTopCapId(null)
		setCapNewerActive(false)
		setUserScrolled(true)
		try {
			const currentState = window.history.state || {}
			if (currentState.resumeCardId) {
				const { resumeCardId, ...rest } = currentState
				window.history.replaceState(rest, '')
			}
		} catch {}
		try { window.scrollTo({ top: 0, behavior: 'auto' }) } catch { try { window.scrollTo(0,0) } catch {} }
		loadChunks(0)
	}

	const handleOpenFavorites = async () => {
		if (favoritesMode) { setFavoritesMode(false); return }
		try {
			const sid = sessionStorage.getItem('sid') || ''
			const res = await fetch('/api/user/saved', { headers: { 'x-uid': uid, 'x-sid': sid } })
			if (!res.ok) throw new Error('saved not ok')
			const data = await res.json()
			const saved = Array.isArray(data.items) ? data.items : []
			setFavorites(saved)
			setFavoritesMode(true)
			// Scroll to top when switching mode
			window.scrollTo({ top: 0, behavior: 'instant' })
		} catch (e) {
			console.error('favorites load error', e)
		}
	}

	// Initial load
	useEffect(() => {
		const initialize = async () => {
			try {
				const navs = performance.getEntriesByType?.('navigation') || []
				if (navs[0]?.type === 'reload') wasReloadRef.current = true
			} catch {}
			const historyState = (() => {
				try { return window.history?.state || {} } catch { return {} }
			})()
			const historyResumeId = (() => {
				const raw = historyState?.resumeCardId
				const val = Number(raw)
				return Number.isFinite(val) ? val : null
			})()
		if (wasReloadRef.current) {
			const storedResumeId = readStoredCardId()
			const preferredResumeId = storedResumeId ?? historyResumeId
			if (preferredResumeId != null) {
				const ok = await loadChunkById(preferredResumeId)
				if (ok) {
					try { sessionStorage.setItem('resumeCardId', String(preferredResumeId)) } catch {}
					await checkForNewCards(preferredResumeId)
					return
				}
			}
		}
		if (urlCardId != null) {
			const ok = await loadChunkById(urlCardId)
				if (ok) {
					if (wasReloadRef.current) await checkForNewCards(urlCardId)
					return
				}
			}
			if (!urlCardId && historyResumeId != null) {
				setScrollTargetId((prev) => prev ?? historyResumeId)
				try { sessionStorage.setItem('resumeCardId', String(historyResumeId)) } catch {}
				if (wasReloadRef.current) await checkForNewCards(historyResumeId)
				return
			}
			await loadChunks(0)
			if (wasReloadRef.current) await checkForNewCards(null)
		}
		initialize()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [urlCardId])

	// Keep a fresh snapshot whenever chunks change for instant back navigation
	useEffect(() => {
		if (chunks.length === 0) return
		saveSnapshot()
	}, [chunks, startChunk, totalChunks, meta])

	// Keep URL stable on scroll (no /card{id} updates); only remember resume id in session
	useEffect(() => {
		let ticking = false
		const rememberCenterCard = () => {
			const cards = document.querySelectorAll("[id^='card-']")
			if (!cards.length) return
			const viewportCenter = window.innerHeight / 2
			let bestId = null
			let bestDist = Infinity
			cards.forEach((el) => {
				const rect = el.getBoundingClientRect()
				if (rect.bottom <= 0 || rect.top >= window.innerHeight) return
				const center = rect.top + rect.height / 2
				const dist = Math.abs(center - viewportCenter)
				if (dist < bestDist) {
					bestDist = dist
					const id = el.id || ''
					const n = Number(id.replace('card-', ''))
					if (Number.isFinite(n)) bestId = n
				}
			})
			if (bestId != null && currentUrlCardRef.current !== bestId) {
				currentUrlCardRef.current = bestId
				setCenterCardId(bestId)
				sessionStorage.setItem('resumeCardId', String(bestId))
				try {
					const currentState = window.history.state || {}
					if (currentState.resumeCardId !== bestId) {
						window.history.replaceState({ ...currentState, resumeCardId: bestId }, '')
					}
				} catch {}
			}
		}
		const onScroll = () => {
			if (ticking) return
			ticking = true
			requestAnimationFrame(() => {
				rememberCenterCard()
				ticking = false
			})
		}
		window.addEventListener('scroll', onScroll, { passive: true })
		rememberCenterCard()
		return () => window.removeEventListener('scroll', onScroll)
	}, [chunks])

	useEffect(() => {
		let ticking = false
		const checkForLoadMore = () => {
			if (favoritesMode) return // no infinite scroll in favorites
			if (scrollTargetId != null) return // wait until initial deep-link scroll completes
			if (!userScrolled) return // do not auto-load until user interacts
			// Get all currently rendered cards
			const allItems = chunks.flatMap((ch) => ch.items || []).filter(item => item && item.idNumber != null)
			if (allItems.length < 4) return // Need at least 4 cards to check

			// Sort by idNumber DESCENDING (same as render order)
			allItems.sort((a, b) => (b.idNumber || 0) - (a.idNumber || 0))
			
			// TOP: If user is near the very top, load previous (newer) chunk
			const nearTop = (window.scrollY || 0) <= 200
			if (nearTop && !loading) {
				const firstLoaded = chunks.length ? chunks[0].chunkIndex : startChunk
				const prev = firstLoaded - 1
				if (prev >= 0) {
					if (fullItems && fullItems.length) {
						applyLocalChunk(prev)
					} else if (lastRequestedUpwardChunkRef.current !== prev) {
						loadPreviousChunk(prev)
					}
				}
			}

			// Get the 4th from last card (index: length - 4)
			const triggerIndex = allItems.length >= 6 ? allItems.length - 6 : 0
			const triggerCard = allItems[triggerIndex]
			
			if (!triggerCard?.idNumber) return
			
			// Check if the trigger card is in viewport or above it
			const cardElement = document.getElementById(`card-${triggerCard.idNumber}`)
			if (!cardElement) return
			
			const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0
			if (viewportHeight === 0) return
			
			const rect = cardElement.getBoundingClientRect()
			const isVisible = rect.top <= viewportHeight && rect.bottom >= 0
			
			if (isVisible && !loading) {
				const lastLoaded = chunks.length ? chunks[chunks.length-1].chunkIndex : startChunk
				const next = lastLoaded + 1
				if (fullItems && fullItems.length) {
					applyLocalChunk(next)
				} else if (totalChunks == null || next < totalChunks) {
					if (totalChunks == null || next < totalChunks) loadChunks(next)
				}
			}
		}

		const onScroll = () => {
			if (ticking) return
			ticking = true
			requestAnimationFrame(() => {
				checkForLoadMore()
				ticking = false
			})
		}

		// Check immediately and on scroll
		checkForLoadMore()
		window.addEventListener('scroll', onScroll, { passive: true })
		return () => window.removeEventListener('scroll', onScroll)
	}, [chunks, totalChunks, fullItems, loading, favoritesMode, scrollTargetId, userScrolled])

	// Bottom sentinel observer: ensures loading when reaching absolute end
	useEffect(() => {
		if (favoritesMode) return
		if (scrollTargetId != null) return // wait until initial deep-link scroll completes
		if (!userScrolled) return // do not auto-load until user interacts
		const el = bottomSentinelRef.current
		if (!el) return
		const obs = new IntersectionObserver((entries) => {
			for (const e of entries) {
				if (!e.isIntersecting) continue
				if (loading) continue
				const lastLoaded = chunks.length ? chunks[chunks.length-1].chunkIndex : startChunk
				const next = lastLoaded + 1
				if (fullItems && fullItems.length) {
					applyLocalChunk(next)
				} else if (totalChunks == null || next < totalChunks) {
					if (lastRequestedChunkRef.current !== next) loadChunks(next)
				}
			}
		}, { root: null, rootMargin: '600px 0px 600px 0px', threshold: 0 })
		obs.observe(el)
		return () => obs.disconnect()
	}, [chunks, totalChunks, fullItems, loading, favoritesMode, scrollTargetId, userScrolled])

/* Removed top sentinel observer in favor of scroll-based nearTop detection */

	useEffect(() => {
		if (chunks.length === 0) return
		const lastLoadedChunk = chunks[chunks.length - 1].chunkIndex
		
		// Defer analytics to avoid blocking critical path
		setTimeout(() => {
			fetch('/api/analytics/events', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ uid, event: 'chunk_view', chunkIndex: lastLoadedChunk, ts: Date.now() })
			}).catch(()=>{})
		}, 100)
		
		// Scroll to target card by id_number once loaded
		if (scrollTargetId != null) {
			const el = document.getElementById(`card-${scrollTargetId}`)
			if (el) {
				el.scrollIntoView({ behavior: 'instant', block: 'start' })
				setHighlightId(scrollTargetId)
				setTimeout(() => setHighlightId(null), 1000)
				setScrollTargetId(null)
				// Allow newer items above to load after initial scroll to target
				setCapNewerActive(false)
				const onFirstScroll = () => {
					setUserScrolled(true)
					window.removeEventListener('wheel', onFirstScroll)
					window.removeEventListener('touchstart', onFirstScroll)
				}
				window.addEventListener('wheel', onFirstScroll, { passive: true })
				window.addEventListener('touchstart', onFirstScroll, { passive: true })
			}
		}
	}, [chunks, scrollTargetId])

	const onCardClick = (idNumber, article) => {
		saveSnapshot()
		sessionStorage.setItem('resumeCardId', String(idNumber))
		navigate(`/article/${idNumber}`, { state: { article } })
	}

	useEffect(() => {
		if (!showNewCardsNotice) return
		const resumeId = readStoredCardId()
		if (resumeId != null) rememberNoticeShownFor(resumeId)
	}, [showNewCardsNotice])

	const onWrapperClick = (e, idNumber, article) => {
		const btn = e.target.closest('button.icon-btn')
		if (btn) {
			const label = (btn.getAttribute('aria-label') || '').toLowerCase()
			if (label === 'like' || label === 'more' || label === 'share') return
		}
		const cardEl = e.target.closest('article.feed-card.card')
		if (!cardEl) return
		onCardClick(idNumber, article)
	}

	// Flatten all items and ensure they have idNumber
	const allItems = useMemo(() => {
		const items = chunks.flatMap((ch) => ch.items || []).filter(item => item && item.idNumber != null)
		items.sort((a, b) => (b.idNumber || 0) - (a.idNumber || 0))
		return items
	}, [chunks])

	// Favorites mapped to full article if loaded, otherwise minimal
	const favoriteArticles = favorites
		.map((fav) => {
			// If API already returned full normalized article, use it directly
			if (fav && (fav.description != null || fav.image != null || (Array.isArray(fav.favicons) && fav.favicons.length))) {
				return fav
			}
			// Else, try to find it in currently loaded feed items
			const found = allItems.find((it) => it.idNumber === fav.idNumber)
			return found || { id: fav.idNumber, idNumber: fav.idNumber, title: fav.title || `#${fav.idNumber}`, description: '', sourcesCount: 0, image: null, favicons: [], bgColor: null, bgColorDark: null, publishedAt: null }
		})
		.sort((a, b) => (b.idNumber || 0) - (a.idNumber || 0))

	const topItem = allItems.length ? { title: allItems[0].title, image: (Array.isArray(allItems[0].images) && allItems[0].images.length ? allItems[0].images[0] : allItems[0].image), description: allItems[0].description || '' } : null

	return (
		<div className="discover-mobile">
			{showNewCardsNotice && !favoritesMode && (
				<div className="new-pill" role="status" aria-live="polite">
					<div className="pill-text"><strong>New cards</strong> have been added since you last visited.</div>
					<div className="pill-actions">
						<button className="pill-btn" onClick={refreshForNewCards}>Refresh</button>
						<button className="pill-btn ghost" onClick={dismissNewCardsNotice}>Dismiss</button>
					</div>
				</div>
			)}
			<HeaderMobile
				title={favoritesMode ? 'Favorites' : 'Discover'}
				onResetFeed={handleReset}
				onOpenSearch={() => setShowSearch(true)}
				onToggleSections={() => setHideDescriptions(prev => !prev)}
				onOpenFavorites={handleOpenFavorites}
				isFavorites={favoritesMode}
				topItem={topItem}
			/>
			{/* Removed decorative banner image as requested */}
			<CategoryChips />
			<div className="feed-list" ref={feedListRef}>
				<div ref={topSentinelRef} style={{ height: '1px', visibility: 'hidden' }} />
				{loading && allItems.length === 0 && !favoritesMode && (
					<>
						{Array.from({ length: 6 }).map((_, i) => (<SkeletonCard key={`sk-${i}`} />))}
					</>
				)}
				{loading && allItems.length > 0 && !favoritesMode && (
					<div className="text-muted">Loading...</div>
				)}
				{empty && !loading && chunks.length === 0 && !favoritesMode && (
					<div className="text-muted">No news available.</div>
				)}
				{(favoritesMode ? favoriteArticles : allItems).map((item, idx) => {
					if (!item.idNumber) return null
					const needsSeparator = (!favoritesMode) && (((idx + 1) % 7) === 0)
					return (
						<React.Fragment key={`frag-${item.idNumber || item.id || item.title}`}>
							<div 
								id={`card-${item.idNumber}`} 
									onClick={(e) => onWrapperClick(e, item.idNumber, {
										id: item.id,
										idNumber: item.idNumber,
										title: item.title,
										description: hideDescriptions ? '' : item.description,
										sourcesCount: item.sourcesCount,
										image: Array.isArray(item.images) && item.images.length ? item.images[0] : item.image,
										favicons: item.favicons,
										bgColor: item.bgColor,
										bgColorDark: item.bgColorDark,
										publishedAt: item.publishedAt
									})}
								role="button" 
								tabIndex={0}
							>
								<FeedCard 
							article={{
								id: item.id,
								idNumber: item.idNumber,
								title: item.title,
								description: hideDescriptions ? '' : item.description,
								sources: item.sourcesCount,
								image: Array.isArray(item.images) && item.images.length ? item.images[0] : item.image,
								favicons: item.favicons,
								bgColor: item.bgColor,
								bgColorDark: item.bgColorDark,
								publishedAt: item.publishedAt
							}}
									globalIndex={idx} 
									highlighted={highlightId === item.idNumber} 
									onOpen={() => onCardClick(item.idNumber, {
										id: item.id,
										idNumber: item.idNumber,
										title: item.title,
										description: hideDescriptions ? '' : item.description,
										sourcesCount: item.sourcesCount,
										image: Array.isArray(item.images) && item.images.length ? item.images[0] : item.image,
										favicons: item.favicons,
										bgColor: item.bgColor,
										bgColorDark: item.bgColorDark,
										publishedAt: item.publishedAt
									})}
									hideMeta={hideDescriptions}
								/>
							</div>
							{needsSeparator && <div className="feed-separator" aria-hidden="true" />}
						</React.Fragment>
					)
				})}
				<div ref={bottomSentinelRef} />
			</div>
			{showSearch && (
				<SearchOverlay
				items={(favoritesMode ? favoriteArticles : allItems).map((item) => ({
						id: item.id,
						idNumber: item.idNumber,
						title: item.title,
						description: item.description,
					image: Array.isArray(item.images) && item.images.length ? item.images[0] : item.image,
						bgColor: item.bgColor,
						bgColorDark: item.bgColorDark,
						favicons: item.favicons,
						sourcesCount: item.sourcesCount
					}))}
					onClose={() => setShowSearch(false)}
					onSubmit={() => {}}
					onSelect={(r) => {
						setShowSearch(false)
						const pool = favoritesMode ? favoriteArticles : allItems
						const foundItem = pool.find((it) => 
							it.idNumber === r.idNumber || 
							(it.id || it.title) === (r.id || r.title)
						)
						if (foundItem && foundItem.idNumber) {
							onCardClick(foundItem.idNumber, {
								id: foundItem.id,
								idNumber: foundItem.idNumber,
								title: foundItem.title,
								description: foundItem.description,
								sourcesCount: foundItem.sourcesCount,
								image: foundItem.image,
								favicons: foundItem.favicons,
								bgColor: foundItem.bgColor,
								bgColorDark: foundItem.bgColorDark
							})
						}
					}}
				/>
			)}
		</div>
	)
} 