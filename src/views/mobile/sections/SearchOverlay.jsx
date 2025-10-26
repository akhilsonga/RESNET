import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import './search.mobile.scss'

export default function SearchOverlay({ items = [], onClose, onSubmit, onSelect }) {
	const [q, setQ] = useState('')
	const [remoteResults, setRemoteResults] = useState([])
	const [remoteSuggestions, setRemoteSuggestions] = useState([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState(null)
	const inputRef = useRef(null)
	const activeRequestRef = useRef(null)
	const debounceTimerRef = useRef(null)

	useEffect(() => {
		// Auto focus input when shown
		try { inputRef.current?.focus() } catch {}
		
		// Prevent body scroll when overlay is open
		const originalOverflow = document.body.style.overflow
		const originalPosition = document.body.style.position
		const scrollY = window.scrollY
		
		document.body.style.overflow = 'hidden'
		document.body.style.position = 'fixed'
		document.body.style.top = `-${scrollY}px`
		document.body.style.width = '100%'
		
		const onKey = (e) => {
			if (e.key === 'Escape') onClose?.()
		}
		window.addEventListener('keydown', onKey)
		
		return () => {
			window.removeEventListener('keydown', onKey)
			// Restore body scroll
			document.body.style.overflow = originalOverflow
			document.body.style.position = originalPosition
			document.body.style.top = ''
			document.body.style.width = ''
			window.scrollTo(0, scrollY)
		}
	}, [onClose])

	const handleSubmit = (e) => {
		e.preventDefault()
		if (typeof onSubmit === 'function') onSubmit(q)
	}

	const simplify = (s = '') => s
		.toLowerCase()
		.replace(/[\u2026…]+/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()

	const localResults = useMemo(() => {
		const list = Array.isArray(items) ? items : []
		const query = simplify(q)
		if (!query) return []
		const scored = []
		for (const it of list) {
			const title = simplify(it.title || '')
			const desc = simplify(it.description || '')
			let match = false
			let score = 1000
			if (title.startsWith(query)) { match = true; score = 0 }
			else if (title.includes(query)) { match = true; score = 1 }
			else if (desc.includes(query)) { match = true; score = 2 }
			if (match) scored.push({ item: it, score })
		}
		scored.sort((a,b) => a.score - b.score || (a.item.title || '').length - (b.item.title || '').length)
		return scored.slice(0, 20).map(s => s.item)
	}, [items, q])

	useEffect(() => {
		const query = q.trim()
		if (!query) {
			setRemoteResults([])
			setRemoteSuggestions([])
			setError(null)
			setLoading(false)
			if (activeRequestRef.current) {
				activeRequestRef.current.abort()
				activeRequestRef.current = null
			}
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current)
				debounceTimerRef.current = null
			}
			return
		}

		if (debounceTimerRef.current) {
			clearTimeout(debounceTimerRef.current)
		}
		if (activeRequestRef.current) {
			activeRequestRef.current.abort()
			activeRequestRef.current = null
		}

		setLoading(true)
		setError(null)

		const controller = new AbortController()
		activeRequestRef.current = controller

		debounceTimerRef.current = setTimeout(async () => {
			try {
				const endpoint = `/api/search?q=${encodeURIComponent(query)}`
				const response = await fetch(endpoint, { signal: controller.signal })
				if (!response.ok) throw new Error(`Search request failed: ${response.status}`)
				const data = await response.json()
				if (controller.signal.aborted) return
				const results = Array.isArray(data?.results) ? data.results : []
				const suggestions = data?.suggestions && typeof data.suggestions === 'object'
					? Object.entries(data.suggestions)
						.sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
						.map(([term]) => term)
					: []
				setRemoteResults(results)
				setRemoteSuggestions(suggestions.slice(0, 10))
				setError(null)
			} catch (err) {
				if (controller.signal.aborted) return
				console.error('SearchOverlay remote search error:', err)
				setRemoteResults([])
				setRemoteSuggestions([])
				setError('Unable to load results. Check your connection and try again.')
			} finally {
				if (!controller.signal.aborted) {
					setLoading(false)
					activeRequestRef.current = null
				}
			}
		}, 300)

		return () => {
			controller.abort()
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current)
				debounceTimerRef.current = null
			}
		}
	}, [q])

	useEffect(() => () => {
		if (activeRequestRef.current) activeRequestRef.current.abort()
		if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
	}, [])

	return (
		<div className="search-overlay" role="dialog" aria-label="Search" aria-modal="true" onClick={() => onClose?.()}>
			<div className="search-sheet" onClick={(e) => e.stopPropagation()}>
				<form className="search-bar" role="search" onSubmit={handleSubmit}>
					<Search size={18} className="search-icon" aria-hidden="true" />
					<input
						ref={inputRef}
						type="text"
						placeholder="Search"
						value={q}
						onChange={(e) => setQ(e.target.value)}
						aria-label="Search query"
					/>
					{q && (
						<button type="button" className="clear-btn" aria-label="Clear" onClick={() => setQ('')}>
							<X size={16} />
						</button>
					)}
					<button type="button" className="cancel-btn" onClick={() => onClose?.()}>Cancel</button>
				</form>
				<div className="search-results">
					{!q && <div className="hint">Type to search…</div>}
					{q && (
						<>
							{loading && <div className="hint">Searching…</div>}
							{!loading && error && <div className="hint error">{error}</div>}
							{!loading && !error && remoteResults.length === 0 && localResults.length === 0 && (
								<div className="hint">No results</div>
							)}
							{!loading && !error && remoteSuggestions.length > 0 && (
								<div className="search-suggestions" aria-live="polite">
									<div className="suggestions-title">Popular searches</div>
									<div className="suggestions-list">
										{remoteSuggestions.map((term, idx) => (
											<button
												key={term}
												type="button"
												className="suggestion-chip"
												onClick={() => setQ(term)}
												style={{ animationDelay: `${idx * 0.04}s` }}
											>
												{term}
											</button>
										))}
									</div>
								</div>
							)}
							{!loading && !error && remoteResults.length > 0 && (
								<>
									{remoteSuggestions.length > 0 && <div className="results-divider" />}
									<ul className="results-list" role="listbox">
										{remoteResults.map((r, i) => {
											const key = r.id || r.idNumber || r.title || `${r.card || 'result'}-${i}`
										const thumb = Array.isArray(r.images) && r.images.length ? r.images[0] : (r.image || r.image_url || null)
											const description = r.description || r.summary || ''
											const published = r.published || r.published_at || r.date || ''
											const score = r.score || r.detail?.score
											return (
												<li 
													key={key} 
													className="result-item" 
													role="option" 
													onClick={() => onSelect?.({ ...r, image: thumb })}
													style={{ animationDelay: `${(remoteSuggestions.length * 0.04) + (i * 0.03)}s` }}
												>
													{thumb ? (
														<img src={thumb} alt="" className="result-thumb" loading="lazy" />
													) : (
														<div className="result-thumb placeholder" />
													)}
													<div className="result-meta">
														<div className="result-title">{r.title}</div>
														{description && <div className="result-desc">{description}</div>}
														{(published || score) && (
															<div className="result-extra">
																{published && <span className="result-chip" aria-label="Published">{published}</span>}
																{score && <span className="result-chip" aria-label="Score">{score}</span>}
															</div>
														)}
													</div>
												</li>
										)
										})}
									</ul>
								</>
							)}
							{!loading && !error && remoteResults.length === 0 && localResults.length > 0 && (
								<ul className="results-list" role="listbox">
									{localResults.map((r, i) => (
										<li 
											key={(r.id || r.title || i)} 
											className="result-item" 
											role="option" 
											onClick={() => onSelect?.(r)}
											style={{ animationDelay: `${(remoteSuggestions.length * 0.04) + (i * 0.03)}s` }}
										>
											{r.image ? (
												<img src={r.image} alt="" className="result-thumb" loading="lazy" />
											) : (
												<div className="result-thumb placeholder" />
											)}
											<div className="result-meta">
												<div className="result-title">{r.title}</div>
												{r.description && <div className="result-desc">{r.description}</div>}
											</div>
										</li>
									))}
								</ul>
							)}
						</>
					)}
				</div>
			</div>
		</div>
	)
}


