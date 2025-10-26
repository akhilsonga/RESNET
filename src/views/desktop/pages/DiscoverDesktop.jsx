import React, { useEffect, useRef, useState } from 'react'
import SectionHeader from '../sections/SectionHeader'
import { useNavigate } from 'react-router-dom'
import GridArticleCard from '../sections/GridArticleCard'
import './discover.desktop.scss'

const CHUNK_SIZE = 18
const PREFETCH_COUNT = 1

export default function DiscoverDesktop() {
    const navigate = useNavigate()
	const [chunks, setChunks] = useState([])
	const [totalChunks, setTotalChunks] = useState(null)
	const [loading, setLoading] = useState(false)
	const [empty, setEmpty] = useState(false)
	const sentinelRef = useRef(null)

	const applyChunks = (data) => {
		setTotalChunks(data.totalChunks)
		setChunks(prev => {
			const map = new Map(prev.map(c => [c.chunkIndex, c]))
			for (const ch of (data.chunks || [])) map.set(ch.chunkIndex, ch)
			return Array.from(map.values()).sort((a,b)=>a.chunkIndex-b.chunkIndex)
		})
	}

	const fallbackLoadList = async () => {
		try {
			const r = await fetch('/api/news')
			if (!r.ok) throw new Error('list not ok')
			const d = await r.json()
			const items = Array.isArray(d.items) ? d.items : []
			if (items.length === 0) { setEmpty(true); return }
			setChunks([{ chunkIndex: 0, items }])
			setTotalChunks(1)
		} catch {
			setEmpty(true)
		}
	}

	const loadChunks = async (from) => {
		if (loading) return
		setLoading(true)
		try {
			const res = await fetch(`/api/news/chunks?size=${CHUNK_SIZE}&start=${from}&count=${PREFETCH_COUNT}`)
			if (!res.ok) throw new Error('chunks not ok')
			const data = await res.json()
			if ((data.chunks?.length || 0) === 0) return fallbackLoadList()
			applyChunks(data)
		} catch {
			fallbackLoadList()
		} finally { setLoading(false) }
	}

	useEffect(() => { loadChunks(0) }, [])

	useEffect(() => {
		const obs = new IntersectionObserver((entries) => {
			for (const e of entries) {
				if (e.isIntersecting) {
					const lastLoaded = chunks.length ? chunks[chunks.length-1].chunkIndex : 0
					const next = lastLoaded + 1
					if (totalChunks == null || next < totalChunks) loadChunks(next)
				}
			}
		}, { rootMargin: '600px' })
		if (sentinelRef.current) obs.observe(sentinelRef.current)
		return () => obs.disconnect()
	}, [chunks, totalChunks])

    let allItems = chunks.flatMap((ch) => ch.items || [])
    // Remove specific article(s) on desktop
    allItems = allItems.filter((it) => {
        const idn = Number(it.idNumber || it.id)
        return idn !== 5021
    })
    // Sort by idNumber DESC like mobile
    allItems.sort((a,b)=> (b.idNumber||0)-(a.idNumber||0))

    const mapSize = (raw) => {
        const s = String(raw || '').toLowerCase().trim()
        if (s === 'high' || s === 'large' || s === 'big') return 'high'
        if (s === 'low' || s === 'small' || s === 'tiny') return 'low'
        return 'medium'
    }

	return (
		<div className="discover-desktop">
			<SectionHeader title="Discover" />
			<div className="grid">
				{(() => {
					const elements = []
                    for (let i = 0; i < allItems.length; i++) {
						const a = allItems[i]
                        const onOpen = () => {
                            const targetId = a.idNumber || a.id
                            if (targetId) navigate(`/article/${targetId}`)
                        }
                        const outline = a.bgColor || (a.card_color && a.card_color.hex) || (typeof a.card_color === 'string' ? a.card_color : null)
                        elements.push(
                            <GridArticleCard key={(a.id || a.idNumber || a.title) + '-card'} onOpen={onOpen} outline={outline} article={{
                                id: a.id,
                                idNumber: a.idNumber,
                                title: a.title,
                                description: a.description,
                                sources: a.sourcesCount,
                                image: a.image,
                                favicons: Array.isArray(a.favicons) ? a.favicons : [],
                                age: a.age,
                                images: Array.isArray(a.images) ? a.images.slice(0, 3) : [],
                                size: mapSize(a.card || a.cardSize || a.priority) // low | medium | high
                            }} />
                        )
						// Insert a row separator after every 9 cards (3 columns x 3 rows)
						if ((i + 1) % 9 === 0) {
							elements.push(<div key={'sep-' + i} className="row-sep" />)
						}
					}
					return elements
				})()}
			</div>
			{loading && <div className="text-muted" style={{ padding: 16 }}>Loading…</div>}
			{empty && !loading && <div className="text-muted" style={{ padding: 16 }}>No news available.</div>}
			<div ref={sentinelRef} />
		</div>
	)
}