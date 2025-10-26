import React, { useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import ImageWithFallback from '../../../shared/components/ImageWithFallback'
import './fullscreen.mobile.scss'

export default function FullscreenArticle({ article, onClose }) {
	useEffect(() => {
		const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
		document.addEventListener('keydown', onKey)
		const prevOverflow = document.body.style.overflow
		document.body.style.overflow = 'hidden'
		return () => {
			document.removeEventListener('keydown', onKey)
			document.body.style.overflow = prevOverflow
		}
	}, [onClose])

	if (!article) return null

	return (
		<div className="fs-overlay" role="dialog" aria-modal="true">
			<div className="fs-card">
				<div className="fs-topbar">
					<button className="icon-btn" aria-label="Close" onClick={onClose}><ArrowLeft size={18} /></button>
					<span className="fs-title">Article</span>
					<span style={{ width: 36 }} />
				</div>
				<ImageWithFallback src={article.image} alt="" style={{ height: 260 }} />
				<div className="fs-content">
					<h2>{article.title}</h2>
					{article.description && <p className="text-muted" style={{ marginTop: 8 }}>{article.description}</p>}
					<p className="text-muted" style={{ marginTop: 12 }}>{article.sources} sources</p>
				</div>
			</div>
		</div>
	)
} 