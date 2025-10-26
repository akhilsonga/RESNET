import React from 'react'
import { useParams, Link } from 'react-router-dom'
import ImageWithFallback from '../../../shared/components/ImageWithFallback'

export default function ArticleDesktop() {
    const { id } = useParams()
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState('')
    const [item, setItem] = React.useState(null)

    React.useEffect(() => {
        let alive = true
        ;(async () => {
            try {
                setLoading(true)
                setError('')
                const r = await fetch(`/api/news/chunk-by-id/${id}`, { cache: 'no-store' })
                if (!r.ok) throw new Error('not ok')
                const d = await r.json()
                const items = Array.isArray(d?.chunk?.items) ? d.chunk.items : []
                const targetId = Number(id)
                const found = items.find(x => (Number(x.idNumber) === targetId) || (Number(x.id) === targetId)) || items[0] || null
                if (alive) setItem(found)
            } catch (e) {
                if (alive) setError('Failed to load article')
            } finally {
                if (alive) setLoading(false)
            }
        })()
        return () => { alive = false }
    }, [id])

    if (loading) return <div style={{ padding: 16 }}>Loading…</div>
    if (error) return <div style={{ padding: 16 }}>{error}</div>
    if (!item) return <div style={{ padding: 16 }}>Article not found.</div>

	const hero = Array.isArray(item.images) && item.images.length ? item.images[0] : (item.image || (Array.isArray(item.image_url) ? item.image_url[0] : ''))
    const favicons = Array.isArray(item.favicons) ? item.favicons : []
    const pageUrls = Array.isArray(item.page_url) ? item.page_url : (item.url ? [item.url] : [])

    return (
        <article className="card" style={{ maxWidth: 980, margin: '16px auto', border: '1px solid var(--border)', background: '#fff' }}>
            {hero && (
                <div className="hero-wrap" style={{ position: 'relative' }}>
                    <ImageWithFallback className="hero" src={hero} alt="" priority width={980} />
                </div>
            )}
            <div className="card-body" style={{ padding: 16 }}>
                <h1 className="card-title" style={{ margin: '0 0 10px 0', fontSize: 26 }}>{item.title || 'Untitled'}</h1>
                {item.description && (
                    <p className="description" style={{ fontSize: 16, lineHeight: 1.6 }}>{item.description}</p>
                )}
                <div className="card-meta" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border)' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {favicons.slice(0, 5).map((src, i) => (
                            <img key={i} src={src} alt="" className="favicon" style={{ width: 18, height: 18, borderRadius: 999 }} />
                        ))}
                        <span className="sources-label text-muted" style={{ fontSize: 14 }}>{item.sourcesCount || 0} sources</span>
                        <span className="sources-label text-muted" style={{ fontSize: 14 }}>ID: {item.idNumber ?? item.id ?? '-'}</span>
                    </div>
                    <div className="actions" style={{ display: 'inline-flex', gap: 8 }}>
                        {pageUrls.slice(0, 3).map((u, j) => (
                            <a key={j} className="chip" href={u} target="_blank" rel="noreferrer" style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid var(--border)' }}>Link {j+1}</a>
                        ))}
                        <Link className="chip" to="/" style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid var(--border)' }}>Back</Link>
                    </div>
                </div>
            </div>
        </article>
    )
}





