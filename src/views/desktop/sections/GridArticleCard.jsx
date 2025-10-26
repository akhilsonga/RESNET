import React from 'react'
import ImageWithFallback from '../../../shared/components/ImageWithFallback'

export default function GridArticleCard({ article, onOpen, outline }) {
	const descFull = (article.description || '')
    const size = (article.size === 'low' || article.size === 'high') ? article.size : 'medium'
    const styleVars = outline ? { ['--outline']: outline } : undefined
	const hero = Array.isArray(article.images) && article.images.length ? article.images[0] : article.image
	return (
		<article className={`card size-${size}`} style={styleVars}>
			<div className="hero-wrap">
				{hero && <ImageWithFallback className="hero" src={hero} alt="" priority width={640} />}
				{article.age && (
					<div className="age-badge" aria-label="published age">{article.age}</div>
				)}
			</div>
			<div className="card-body">
				<h3 className="card-title">{article.title}</h3>
				{descFull && (
					<p className="description text-muted">{descFull}</p>
				)}
				<div className="card-meta">
					{Array.isArray(article.favicons) && article.favicons.length > 0 && (
						<div className="favicons-row" aria-hidden="true">
							{article.favicons.slice(0, 5).map((src, i) => (
								<img key={i} src={src} alt="" className="favicon" loading="lazy" decoding="async" />
							))}
						</div>
					)}
					<div className="actions" aria-label="Card actions">
						<button className="seg" disabled>Open</button>
						<div className="seg-sep" aria-hidden="true" />
						<button className="seg">Save</button>
						<div className="seg-sep" aria-hidden="true" />
						<button className="seg">Share</button>
					</div>
				</div>
			</div>
		</article>
	)
} 