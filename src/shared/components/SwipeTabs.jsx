import React, { useEffect, useMemo, useRef, useState } from 'react'
import './swipe-tabs.mobile.scss'

export default function SwipeTabs({ tabs = [], initialIndex = 0, activeColor, onChange }) {
	const [index, setIndex] = useState(initialIndex)
	const [dragX, setDragX] = useState(0)
	const startXRef = useRef(null)
	const startYRef = useRef(null)
	const lockRef = useRef('none') // 'none' | 'horizontal' | 'vertical'
	const containerRef = useRef(null)
	const prevIndexRef = useRef(initialIndex)

	const clampedIndex = (i) => Math.max(0, Math.min(i, tabs.length - 1))

	const onTouchStart = (e) => {
		startXRef.current = e.touches[0].clientX
		startYRef.current = e.touches[0].clientY
		lockRef.current = 'none'
		setDragX(0)
	}
	const onTouchMove = (e) => {
		if (startXRef.current == null) return
		const curX = e.touches[0].clientX
		const curY = e.touches[0].clientY
		const dx = curX - startXRef.current
		const dy = curY - startYRef.current
		// Lock direction after small movement to avoid accidental horizontal swipes
		if (lockRef.current === 'none') {
			const absDx = Math.abs(dx)
			const absDy = Math.abs(dy)
			if (absDx > 10 || absDy > 10) {
				lockRef.current = absDx > absDy + 5 ? 'horizontal' : 'vertical'
			}
		}
		if (lockRef.current !== 'horizontal') return
		setDragX(dx)
	}
	const onTouchEnd = () => {
		if (startXRef.current == null) return
		if (lockRef.current === 'horizontal') {
			const containerWidth = containerRef.current?.offsetWidth || 0
			const dynamicThreshold = containerWidth ? Math.max(80, Math.min(140, containerWidth * 0.25)) : 120
			const dx = dragX
			let next = index
			if (dx < -dynamicThreshold) next = index + 1
			if (dx > dynamicThreshold) next = index - 1
			setIndex(clampedIndex(next))
		}
		setDragX(0)
		startXRef.current = null
		startYRef.current = null
		lockRef.current = 'none'
	}

	const indicatorStyle = useMemo(() => ({ transform: `translateX(${index * 100}%)` }), [index])
	const trackStyle = useMemo(() => ({ transform: `translateX(calc(${-index * 100}% + ${dragX}px))` }), [index, dragX])

	// When switching panels, scroll the page to the top of the panels container
	useEffect(() => {
		if (prevIndexRef.current === index) return
		// Scroll to the very top of the article container so tabs are fully visible
		const articleEl = containerRef.current?.closest('.article-mobile') || document.querySelector('.article-mobile')
		if (articleEl) {
			const y = Math.max(0, articleEl.getBoundingClientRect().top + window.pageYOffset)
			try {
				window.scrollTo({ top: y, behavior: 'smooth' })
			} catch {
				window.scrollTo(0, y)
			}
		}
		if (typeof onChange === 'function') {
			try { onChange(index) } catch {}
		}
		prevIndexRef.current = index
	}, [index])

	const inactiveColor = activeColor
	return (
		<div className="swipe-tabs" ref={containerRef}>
			<div className="tab-bar" role="tablist">
				{tabs.map((t, i) => (
					<button
						key={t.key}
						className={`tab ${i === index ? 'active' : ''}`}
						role="tab"
						aria-selected={i === index}
						onClick={() => setIndex(i)}
						style={i === index
							? (activeColor ? { background: activeColor, color: '#ffffff', borderColor: 'transparent' } : undefined)
							: (inactiveColor ? { color: inactiveColor } : undefined)
						}
					>
						{t.label}
					</button>
				))}
				<span className="indicator" style={indicatorStyle} />
			</div>

			<div
				className="panels"
				onTouchStart={onTouchStart}
				onTouchMove={onTouchMove}
				onTouchEnd={onTouchEnd}
			>
				<div className="track" style={trackStyle}>
					{tabs.map((t) => (
						<section key={t.key} className="panel">
							{t.content}
						</section>
					))}
				</div>
			</div>
		</div>
	)
} 