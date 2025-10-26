import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createServer as createViteServer } from 'vite'
import http from 'http'
import net from 'net'
import os from 'os'
import compression from 'compression'
import sharp from 'sharp'
import webpush from 'web-push'

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())
app.use(compression())
app.use((req, res, next) => {
	if (req.path.startsWith('/api/')) {
		res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
		res.setHeader('Pragma', 'no-cache')
		res.setHeader('Expires', '0')
	}
	next()
})

// In-memory fallback subscriptions (endpoint -> subscription)
const runtimeSubs = new Map()
// In-memory last subscription per uid
const runtimeUidSub = new Map()

// --- Web Push VAPID setup ---
const VAPID_SUBJECT = process.env.WEB_PUSH_SUBJECT || 'mailto:admin@example.com'
let VAPID_PUBLIC_KEY = process.env.WEB_PUSH_PUBLIC_KEY || ''
let VAPID_PRIVATE_KEY = process.env.WEB_PUSH_PRIVATE_KEY || ''
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
	try {
		const keys = webpush.generateVAPIDKeys()
		VAPID_PUBLIC_KEY = keys.publicKey
		VAPID_PRIVATE_KEY = keys.privateKey
    	console.log('\n[web-push] Generated ephemeral VAPID keys for this run:')
    	console.log('PUBLIC_KEY=', VAPID_PUBLIC_KEY)
    	// Do not print private keys to logs
	} catch (e) {
		console.warn('Failed to generate VAPID keys', e)
	}
}
try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY) } catch {}

// Simple in-memory image response cache (small, avoids repeated processing)
const imgCache = new Map() // key: `${u}|${w}`, value: { buf, contentType, ts }
const IMG_CACHE_MAX = 50
function cacheSet(key, value) {
	if (imgCache.size >= IMG_CACHE_MAX) {
		const firstKey = imgCache.keys().next().value
		if (firstKey) imgCache.delete(firstKey)
	}
	imgCache.set(key, value)
}

app.get('/img', async (req, res) => {
	try {
		const u = (req.query.u || '').toString()
		const w = Math.max(64, Math.min(1920, Number(req.query.w) || 800))
		if (!u || !/^https?:\/\//i.test(u)) return res.status(400).send('Invalid url')
		const key = `${u}|${w}`
		const cached = imgCache.get(key)
		if (cached) {
			res.setHeader('Content-Type', cached.contentType)
			res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
			return res.end(cached.buf)
		}
		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), 8000)
		const r = await fetch(u, { signal: controller.signal })
		clearTimeout(timeout)
		if (!r.ok) return res.status(502).send('Upstream fetch failed')
		const arrayBuf = await r.arrayBuffer()
		const inputBuf = Buffer.from(arrayBuf)
		// Resize and convert to WebP (fallback to original if sharp fails)
		let out
		try {
			out = await sharp(inputBuf).resize({ width: w, withoutEnlargement: true }).webp({ quality: 68 }).toBuffer()
			res.setHeader('Content-Type', 'image/webp')
		} catch {
			out = inputBuf
			res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg')
		}
		res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
		cacheSet(key, { buf: out, contentType: res.getHeader('Content-Type'), ts: Date.now() })
		return res.end(out)
	} catch (e) {
		return res.status(500).send('img proxy error')
	}
})

// --- Notifications ---
app.post('/api/notifications/enable', async (req, res) => {
	try {
		const { uid } = req.body || {}
		if (!uid) return res.status(400).json({ error: 'uid required' })
		const client = await getClient()
		const col = client.db(MONGO_ANALYTICS_DB).collection('Users')
		await col.updateOne({ uid }, { $set: { notificationsEnabled: true, notificationsEnabledAt: new Date().toISOString() } }, { upsert: true })
		res.json({ ok: true })
	} catch (e) {
		console.error('POST /api/notifications/enable error', e)
		res.status(500).json({ error: 'failed' })
	}
})

app.post('/api/notifications/sample', async (req, res) => {
	try {
		const { title = 'Hello', body = 'Sample notification' } = req.body || {}
		// Placeholder endpoint; real push uses broadcast below
		res.json({ ok: true, message: 'Sample enqueued (client shows via SW fetch)' })
	} catch (e) {
		res.status(500).json({ error: 'failed' })
	}
})

// --- Web Push endpoints ---
app.get('/api/push/public-key', (req, res) => {
	return res.json({ key: VAPID_PUBLIC_KEY })
})

app.post('/api/push/subscribe', async (req, res) => {
	try {
		const { uid: uidBody, subscription } = req.body || {}
		if (!subscription || !subscription.endpoint) return res.status(400).json({ error: 'Invalid subscription' })
		// Derive uid from cookies if not provided
		let uid = uidBody || null
		if (!uid) {
			try {
				const raw = req.headers.cookie || ''
				const parts = raw.split(';').map(s => s.trim())
				for (const p of parts) {
					if (p.startsWith('uid=')) { uid = decodeURIComponent(p.slice(4)); break }
				}
			} catch {}
		}
		// Always keep in-memory fallback
		runtimeSubs.set(subscription.endpoint, subscription)
		if (uid) runtimeUidSub.set(uid, subscription)
		try {
			const client = await getClient()
			const col = client.db(MONGO_ANALYTICS_DB).collection('PushSubscriptions')
			await col.updateOne(
				{ endpoint: subscription.endpoint },
				{ $set: { uid: uid || null, subscription, updatedAt: new Date().toISOString() }, $setOnInsert: { createdAt: new Date().toISOString() } },
				{ upsert: true }
			)
		} catch (dbErr) {
			console.warn('Push subscribe DB write failed; using in-memory only')
		}
		res.json({ ok: true })
	} catch (e) {
		console.error('POST /api/push/subscribe error', e)
		res.status(500).json({ error: 'failed' })
	}
})

app.post('/api/push/ping', async (req, res) => {
	try {
		const { uid, title = 'resnet News', body = 'Test', icon = '/space-shuttle.png' } = req.body || {}
		if (!uid) return res.status(400).json({ error: 'uid required' })
		let subscription = runtimeUidSub.get(uid) || null
		if (!subscription) {
			try {
				const client = await getClient()
				const col = client.db(MONGO_ANALYTICS_DB).collection('PushSubscriptions')
				const doc = await col.find({ uid }).sort({ updatedAt: -1 }).limit(1).next()
				subscription = doc?.subscription || null
			} catch {}
		}
		if (!subscription) return res.status(404).json({ error: 'subscription not found' })
		await webpush.sendNotification(subscription, JSON.stringify({ title, body, icon }))
		return res.json({ ok: true })
	} catch (e) {
		console.error('POST /api/push/ping error', e)
		return res.status(500).json({ error: 'failed' })
	}
})

app.post('/api/push/broadcast', async (req, res) => {
	try {
		const payload = req.body && Object.keys(req.body).length ? req.body : { title: 'resnet News', body: 'Demo broadcast', icon: '/space-shuttle.png' }
		let subs = []
		try {
			const client = await getClient()
			const col = client.db(MONGO_ANALYTICS_DB).collection('PushSubscriptions')
			subs = await col.find({}).limit(1000).toArray()
		} catch {
			// ignore DB failures
		}
		// Merge with in-memory
		const memorySubs = Array.from(runtimeSubs.values()).map((subscription) => ({ subscription }))
		const allSubs = [...subs, ...memorySubs]
		// de-dup by endpoint
		const seen = new Set()
		const deduped = []
		for (const s of allSubs) {
			const ep = s?.subscription?.endpoint
			if (ep && !seen.has(ep)) { seen.add(ep); deduped.push(s) }
		}
		let sent = 0, removed = 0
		await Promise.all(deduped.map(async (s) => {
			try {
				await webpush.sendNotification(s.subscription, JSON.stringify(payload))
				sent += 1
			} catch (err) {
				if (err && (err.statusCode === 404 || err.statusCode === 410)) {
					removed += 1
					try {
						const client = await getClient()
						await client.db(MONGO_ANALYTICS_DB).collection('PushSubscriptions').deleteOne({ endpoint: s.subscription?.endpoint })
					} catch {}
					runtimeSubs.delete(s.subscription?.endpoint)
				}
			}
		}))
		res.json({ ok: true, sent, removed, memory: runtimeSubs.size })
	} catch (e) {
		console.error('POST /api/push/broadcast error', e)
		res.status(500).json({ error: 'failed' })
	}
})

app.get('/api/push/debug/:uid', async (req, res) => {
	try {
		const uid = req.params.uid
		if (!uid) return res.status(400).json({ error: 'uid required' })
		let subscription = runtimeUidSub.get(uid) || null
		let from = 'memory'
		if (!subscription) {
			try {
				const client = await getClient()
				const col = client.db(MONGO_ANALYTICS_DB).collection('PushSubscriptions')
				const doc = await col.find({ uid }).sort({ updatedAt: -1 }).limit(1).next()
				subscription = doc?.subscription || null
				from = 'db'
			} catch {}
		}
		if (!subscription) return res.status(404).json({ error: 'not found' })
		return res.json({ from, endpoint: subscription.endpoint, keys: subscription.keys || null })
	} catch (e) {
		return res.status(500).json({ error: 'failed' })
	}
})

const MONGO_URI = process.env.MONGO_URI || 'mongodb://10.0.0.238:27017'
const MONGO_DB = process.env.MONGO_DB || 'AI_youtube_data'
const MONGO_COLLECTION = process.env.MONGO_COLLECTION || 'AITUBE_24'
const MONGO_ANALYTICS_DB = process.env.MONGO_ANALYTICS_DB || 'Resnet_Admin'
const PORT = process.env.PORT || 8080
const IS_PROD = process.env.NODE_ENV === 'production'
const CHAIN_API_URL = process.env.CHAIN_API_URL || 'http://127.0.0.1:5006'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DATA_DIR = path.join(__dirname, 'data')
const ANALYTICS_DIR = path.join(__dirname, 'analytics')
const ANALYTICS_FILE = path.join(ANALYTICS_DIR, 'events.jsonl')

let cachedClient
let cachedClientPromise = null

async function getClient() {
	if (cachedClient && cachedClient.topology?.isConnected?.()) return cachedClient
	if (cachedClientPromise) {
		try {
			cachedClient = await cachedClientPromise
			return cachedClient
		} catch (err) {
			cachedClientPromise = null
			throw err
		}
	}
	cachedClientPromise = MongoClient.connect(MONGO_URI, {
		maxPoolSize: 12,
		minPoolSize: 0,
		serverSelectionTimeoutMS: 5000
	})
	try {
		cachedClient = await cachedClientPromise
		return cachedClient
	} catch (err) {
		cachedClientPromise = null
		throw err
	}
}

// --- Simple in-memory cache for news data ---
const apiCache = new Map() // key -> { ts, ttlMs, value }
function getCache(key) {
    const entry = apiCache.get(key)
    if (!entry) return null
    if (Date.now() - entry.ts > entry.ttlMs) { apiCache.delete(key); return null }
    return entry.value
}
function setCache(key, value, ttlMs = 3000) { apiCache.set(key, { ts: Date.now(), ttlMs, value }) }

// Shared haystack cache (flattened news items)
const HAYSTACK_CACHE_TTL = 20000 // 20 seconds
let haystackCacheData = null
let haystackCacheLimit = 0
let haystackCacheTs = 0
let latestChunkSnapshot = null

async function loadHaystack(limitDocs = 20) {
	const now = Date.now()
	// Return cached data when fresh and covers requested depth
	if (haystackCacheData && (now - haystackCacheTs) < HAYSTACK_CACHE_TTL && haystackCacheLimit >= limitDocs) {
		return haystackCacheData
	}

	let hay = []
	try {
		const client = await getClient()
		const col = client.db(MONGO_DB).collection(MONGO_COLLECTION)
		const docLimit = Math.min(500, Math.max(limitDocs, 120))
		const docs = await col.find({}, { projection: { AI_News: 1 } }).sort({ _id: -1 }).limit(docLimit).toArray()
		hay = docs.flatMap((d) => Array.isArray(d?.AI_News) ? d.AI_News : [])
		// Update cache metadata
		haystackCacheData = hay
		haystackCacheLimit = docLimit
		haystackCacheTs = now
	} catch (err) {
		console.error('loadHaystack DB error:', err)
	}
	if (hay.length === 0) {
		const local = await readLocalNews()
		hay = local
		// Cache fallback data as well
		haystackCacheData = hay
		haystackCacheLimit = limitDocs
		haystackCacheTs = now
	}
	return hay
}

async function readLocalNews() {
	try {
		if (!fs.existsSync(DATA_DIR)) return []
		const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'))
		if (files.length === 0) return []
		files.sort((a,b) => fs.statSync(path.join(DATA_DIR,b)).mtimeMs - fs.statSync(path.join(DATA_DIR,a)).mtimeMs)
		const latest = path.join(DATA_DIR, files[0])
		const raw = fs.readFileSync(latest, 'utf-8')
		const json = JSON.parse(raw)
		if (Array.isArray(json)) return json
		if (Array.isArray(json.AI_News)) return json.AI_News
		if (json.AI_News && Array.isArray(json.AI_News[0])) return json.AI_News[0]
		return []
	} catch {
		return []
	}
}

function pickFavicons(results = [], max = 6) {
    const out = []
    const seen = new Set()
    const pushIfNew = (url) => {
        if (!url) return
        try {
            const s = String(url)
            if (!/^https?:\/\//i.test(s)) return
            if (seen.has(s)) return
            seen.add(s)
            out.push(s)
        } catch {}
    }
    for (const r of results) {
        try {
            const pageUrl = r?.url || ''
            const fav = (r?.favicon && typeof r.favicon === 'string') ? r.favicon : null
            let abs = null
            if (fav) {
                try { abs = new URL(fav, pageUrl).toString() } catch { abs = fav }
                pushIfNew(abs)
            } else if (pageUrl) {
                // Fallback to /favicon.ico relative to the page URL
                try { abs = new URL('/favicon.ico', pageUrl).toString(); pushIfNew(abs) } catch {}
            }
            if (out.length >= max) break
        } catch {}
    }
    return out.slice(0, max)
}

function findRawTimestamp(item) {
	const candidates = [
		item?.timestamp,
		item?.published_at,
		item?.publishedAt,
		item?.created_at,
		item?.createdAt,
		item?.date,
		item?.time
	]
	for (const v of candidates) {
		if (v == null) continue
		const s = String(v).trim()
		if (s) return s
	}
	return null
}

function toIsoFromPossibleFormats(raw) {
	if (!raw) return null
	const s = String(raw).trim()
	// If it's already ISO-like
	if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
		const d = new Date(s)
		return isNaN(d.getTime()) ? null : d.toISOString()
	}
	// Format like: 2025-08-30 04:49:19
	if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
		const isoGuess = s.replace(' ', 'T') + 'Z'
		const d = new Date(isoGuess)
		return isNaN(d.getTime()) ? null : d.toISOString()
	}
	// Fallback parse
	const d = new Date(s)
	return isNaN(d.getTime()) ? null : d.toISOString()
}

function formatRelativeAge(iso) {
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

function normalizeItem(item) {
	const sources = item?.Internet?.results || []
	const favicons = pickFavicons(sources)
	const rawTs = findRawTimestamp(item)
	const publishedAt = toIsoFromPossibleFormats(rawTs)
	const age = publishedAt ? formatRelativeAge(publishedAt) : null
	const imageUrls = Array.isArray(item.image_url) ? item.image_url.filter(Boolean) : []
	const images = imageUrls.slice(0, 3)
	const primaryImage = images.length ? images[0] : null
	const rawSize = (() => {
		const candidates = [item.size, item.card, item.card_size, item.cardSize, item.priority]
		for (const value of candidates) {
			if (typeof value === 'string' && value.trim()) return value.trim()
		}
		return null
	})()
	return {
		id: item._id?.toString?.() || item.title,
		idNumber: typeof item.id_number === 'number' ? item.id_number : (Number(item.id_number) || null),
		title: item.title,
		description: item.description,
		sourcesCount: (item?.Internet?.results || []).length,
		favicons,
		bgColor: item?.card_color?.hex || null,
		bgColorDark: item?.card_color_dark?.card_color?.hex || null,
		image: primaryImage,
		images,
		size: rawSize,
		publishedAt,
		date: rawTs || (publishedAt ? publishedAt.replace('T',' ').replace('Z','') : null),
		age
	}
}

function normalizeDetail(item) {
	const base = normalizeItem(item)
	const sources = item?.Internet?.results || []
	return {
		...base,
		images: Array.isArray(item.image_url) ? item.image_url.filter(Boolean).slice(0, 3) : base.images,
		citations: sources.map((r) => ({ title: r.title, url: r.url, description: r.description, favicon: r.favicon })),
		pageUrls: sources.map((r) => r.url).filter(Boolean)
	}
}

// Parse entities field: accept comma-separated string or array, return list of non-empty strings
function parseEntitiesField(raw) {
	if (raw == null) return []
	if (typeof raw === 'string') return raw.split(',').map(s => s.trim()).filter(Boolean)
	if (Array.isArray(raw)) return raw.map(x => String(x).trim()).filter(Boolean)
	const s = String(raw).trim()
	return s ? [s] : []
}

const simplify = (s='') => s
	.toLowerCase()
	.replace(/[\u2026…]+/g,'')
	.replace(/[^a-z0-9]+/g,' ')
	.replace(/\s+/g,' ')
	.trim()

app.get('/api/health', (req, res) => {
	res.json({ ok: true })
})

app.get('/api/news', async (req, res) => {
	try {
		let items = []
		let meta = { source: 'mongo' }
		try {
			const client = await getClient()
			const col = client.db(MONGO_DB).collection(MONGO_COLLECTION)
			const docs = await col.find({}, { projection: { AI_News: 1 } }).sort({ _id: -1 }).limit(5).toArray()
			const itemsRaw = docs.flatMap((d) => Array.isArray(d?.AI_News) ? d.AI_News : [])
			items = itemsRaw.map(normalizeItem)
			meta.docsFetched = docs.length
		} catch {}
		if (items.length === 0) {
			const local = await readLocalNews()
			items = local.map(normalizeItem)
			meta.source = 'file'
		}
		res.json({ items, meta })
	} catch (e) {
		console.error('GET /api/news error', e)
		res.status(500).json({ error: 'Failed to load news' })
	}
})

app.get('/api/news/chunks', async (req, res) => {
	try {
		const size = Math.max(1, Math.min(50, Number(req.query.size) || 6))
		const start = Math.max(0, Number(req.query.start) || 0) // chunk index
		const count = Math.max(1, Math.min(5, Number(req.query.count) || 2))
		const uid = (req.headers['x-uid'] || '').toString()
		const sid = (req.headers['x-sid'] || '').toString()
        // Short-TTL cache for hottest query patterns
        const cacheKey = `chunks|${size}|${start}|${count}`
        const cached = getCache(cacheKey)
        if (cached) return res.json(cached)

        // Load enough docs to cover requested chunk window and maintain continuity
        const desiredItems = (start + count) * size
        const docLimit = Math.min(5000, Math.max(150, Math.ceil(desiredItems / 5) * 10))
        let hay = await loadHaystack(docLimit)
        
        // Normalize, filter invalid, and deduplicate by idNumber to avoid jumps
        hay = hay.map(normalizeItem).filter(item => item.idNumber != null)
        const seen = new Set()
        hay = hay.filter((it) => {
            const n = it.idNumber
            if (!Number.isFinite(n)) return false
            if (seen.has(n)) return false
            seen.add(n)
            return true
        })
        // Sort by id_number descending (latest first)
        hay.sort((a, b) => (b.idNumber || 0) - (a.idNumber || 0))
		
		const totalItems = hay.length
		const totalChunks = Math.ceil(totalItems / size)
		const chunks = []
		for (let c = start; c < Math.min(start + count, totalChunks); c++) {
			const from = c * size
			const to = Math.min(from + size, totalItems)
			const items = hay.slice(from, to)
			chunks.push({ chunkIndex: c, items })
		}

		// Log chunk request metrics (fire and forget - don't block response)
		setImmediate(() => {
			if (uid && sid) {
				(async () => {
					try {
						const { sessions, events } = await getAnalyticsCollections()
						const now = new Date().toISOString()
						let deltaMs = null
						const last = await events.find({ type: 'chunk_request', uid, sessionId: sid }).sort({ ts: -1 }).limit(1).toArray()
						if (last && last[0]?.ts) {
							try { deltaMs = new Date(now).getTime() - new Date(last[0].ts).getTime() } catch {}
						}
						await events.insertOne({ type: 'chunk_request', uid, sessionId: sid, ts: now, start, size, count, deltaMs })
						await sessions.updateOne(
							{ sessionId: sid },
							{ $inc: { chunkRequests: 1 }, $set: { lastChunkAt: now, lastChunkDeltaMs: deltaMs } },
							{ upsert: true }
						)
					} catch (err) {
						console.error('Analytics logging error:', err)
					}
				})() // Execute async IIFE
			}
		}) // Close setImmediate
		
        const payload = { totalItems, totalChunks, size, start, count: chunks.length, chunks }
        setCache(cacheKey, payload, 5000)
        res.json(payload)
	} catch (e) {
		console.error('GET /api/news/chunks error', e)
		res.status(500).json({ error: 'Failed to load chunks' })
	}
})

app.get('/api/news/by-index', async (req, res) => {
	try {
		const i = Number(req.query.i)
		if (!Number.isInteger(i) || i < 0) return res.status(400).json({ error: 'Invalid index' })
		const hay = await loadHaystack(50)
		if (i >= hay.length) return res.status(404).json({ error: 'Not found' })
		return res.json({ item: normalizeDetail(hay[i]) })
	} catch (e) {
		console.error('GET /api/news/by-index error', e)
		res.status(500).json({ error: 'Failed to load article' })
	}
})

app.get('/api/news/by-title', async (req, res) => {
	try {
		const raw = (req.query.title || '').toString()
		const title = decodeURIComponent(raw)
		if (!title) return res.status(400).json({ error: 'Missing title' })
		const needle = simplify(title)
		let hay = await loadHaystack(20)
		let found = hay.find((a) => simplify(a?.title||'') === needle)
		if (!found) found = hay.find((a) => simplify(a?.title||'').includes(needle))
		if (!found) found = hay.find((a) => needle.includes(simplify(a?.title||'')))
		if (!found) return res.status(404).json({ error: 'Not found' })
		return res.json({ item: normalizeDetail(found) })
	} catch (e) {
		console.error('GET /api/news/by-title error', e)
		res.status(500).json({ error: 'Failed to load article' })
	}
})

app.get('/api/news/by-id/:idNumber', async (req, res) => {
	try {
		const idNum = Number(req.params.idNumber)
		if (!Number.isInteger(idNum)) return res.status(400).json({ error: 'Invalid id_number' })
		
		let hay = await loadHaystack(300)
		hay = hay.map(normalizeItem).filter(item => item.idNumber != null)
		const found = hay.find(a => a.idNumber === idNum)

		if (!found) return res.status(404).json({ error: 'Not found' })
		return res.json({ item: normalizeDetail(found) })
	} catch (e) {
		console.error('GET /api/news/by-id error', e)
		res.status(500).json({ error: 'Failed to load article' })
	}
})

// --- Social share preview pages (WhatsApp/Twitter/FB) ---
// Renders minimal HTML with Open Graph/Twitter meta for article image/title/desc
function escapeHtml(s='') {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

async function findArticleByIdentifier(idOrTitle) {
    const rawHay = await loadHaystack(5000)
    const entries = rawHay.map(raw => ({ raw, norm: normalizeItem(raw) })).filter(e => e.norm.idNumber != null)
    const n = Number(idOrTitle)
    if (Number.isInteger(n)) {
        const entry = entries.find(e => e.norm.idNumber === n)
        if (entry) return normalizeDetail(entry.raw)
    }
    const simplify = (s='') => s.toLowerCase().replace(/[\u2026…]+/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()
    const needle = simplify(decodeURIComponent(String(idOrTitle || '')))
    const byExact = entries.find(e => simplify(e.norm.title||'') === needle)
    if (byExact) return normalizeDetail(byExact.raw)
    const byContains = entries.find(e => simplify(e.norm.title||'').includes(needle))
    if (byContains) return normalizeDetail(byContains.raw)
    const byInclusion = entries.find(e => needle.includes(simplify(e.norm.title||'')))
    if (byInclusion) return normalizeDetail(byInclusion.raw)
    return null
}

app.get(['/card:cardId', '/article/:idOrTitle'], async (req, res) => {
    try {
        const idOrTitle = req.params.cardId || req.params.idOrTitle || ''
        const item = await findArticleByIdentifier(idOrTitle)
        const title = item?.title || 'Discover News'
        const description = item?.description || 'Latest AI and tech news'
        const image = (() => {
            try {
                const host = `${req.protocol}://${req.get('host')}`
                const raw = item?.image || (Array.isArray(item?.images) ? item.images.find(Boolean) : null) || null
                if (!raw) return `${host}/space-shuttle.png`
                try {
                    const absolute = new URL(raw)
                    const enc = encodeURIComponent(absolute.toString())
                    return `${host}/img?u=${enc}&w=1200`
                } catch {
                    if (raw.startsWith('/')) return host + raw
                    const enc = encodeURIComponent(raw)
                    return `${host}/img?u=${enc}&w=1200`
                }
            } catch {
                const host = `${req.protocol}://${req.get('host')}`
                return `${host}/space-shuttle.png`
            }
        })()
        const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`
        // If the request is likely from a bot (social crawler), return meta with redirect for rich previews.
        // For normal browsers, serve the SPA without redirect so mobile can handle /card{n} deep links.
        const ua = (req.headers['user-agent'] || '').toString().toLowerCase()
        const isBot = /(bot|crawl|spider|whatsapp|facebookexternalhit|twitterbot|slackbot|linkedinbot|embedly|quora link preview|preview|vkshare|pinterest|skypeuripreview|nuzzel|wxbot|yandex|telegrambot|discordbot)/i.test(ua)
        const destPath = (() => {
            if (item?.idNumber != null) return `/article/${item.idNumber}`
            return '/'
        })()
        const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${escapeHtml(url)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(image)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(image)}" />
    ${/^https:\/\//i.test(image) ? `<meta property="og:image:secure_url" content="${escapeHtml(image)}" />` : ''}
    <link rel="icon" href="/favicon.ico" />
    ${isBot ? `<meta http-equiv="refresh" content="0;url=${escapeHtml(destPath)}" />` : ''}
  </head>
  <body>
    ${isBot ? `<p>Redirecting…</p><script>window.location.replace('${destPath}')</script>` : ''}
  </body>
</html>`
        if (isBot) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            return res.end(html)
        }
        // For browsers, let the SPA handle the route to preserve /card deep links
        const distDir = path.join(rootDir, 'dist')
        return res.sendFile(path.join(distDir, 'index.html'))
    } catch (e) {
        return res.redirect('/')
    }
})

// Return entities for a given id_number (from source data)
app.get('/api/news/entities/:idNumber', async (req, res) => {
	try {
		const idNum = Number(req.params.idNumber)
		if (!Number.isInteger(idNum)) return res.status(400).json({ error: 'Invalid id_number' })
        const cacheKey = `entities|${idNum}`
        const cached = getCache(cacheKey)
        if (cached) return res.json(cached)
        const raw = await loadHaystack(600)
		let found = null
		for (const it of raw) {
			const idv = (() => { try { return Number(it?.id_number) } catch { return NaN } })()
			if (Number.isInteger(idv) && idv === idNum) { found = it; break }
		}
        if (!found) return res.json({ idNumber: idNum, entities: [] })
		const ents = parseEntitiesField(found?.entities)
        const payload = { idNumber: idNum, entities: ents }
        setCache(cacheKey, payload, 10000)
        return res.json(payload)
	} catch (e) {
		console.error('GET /api/news/entities error', e)
		res.status(500).json({ error: 'Failed to load entities' })
	}
})

// Proxy to Chain Search Flask API
app.get('/api/chains/search', async (req, res) => {
	try {
		const entity = (req.query.entity || '').toString()
		if (!entity.trim()) return res.status(400).json({ error: 'Missing entity' })
		const requireId = (req.query.require_id || 'true').toString()
		const url = new URL('/search', CHAIN_API_URL)
		url.searchParams.set('entity', entity)
		url.searchParams.set('require_id', requireId)
		const r = await fetch(url)
		if (!r.ok) {
			const txt = await r.text().catch(() => '')
			return res.status(502).json({ error: 'Upstream failed', status: r.status, body: txt })
		}
		const data = await r.json()
		return res.json(data)
	} catch (e) {
		console.error('GET /api/chains/search error', e)
		res.status(500).json({ error: 'Failed to fetch chains' })
	}
})

app.get('/api/news/meta', async (req, res) => {
	try {
		let hay = await loadHaystack(300)
		hay = hay.map(normalizeItem).filter(item => item.idNumber != null)
		const idNums = hay.map(item => item.idNumber).filter(n => Number.isFinite(n))
		const maxId = idNums.length ? Math.max(...idNums) : null
		const minId = idNums.length ? Math.min(...idNums) : null
		res.json({ totalItems: hay.length, maxId, minId, latestId: maxId })
	} catch (e) {
		console.error('GET /api/news/meta error', e)
		res.status(500).json({ error: 'Failed to load meta' })
	}
})

// Proxy to network search API
app.get('/api/search', async (req, res) => {
	try {
		const query = (req.query.q || '').toString().trim()
		if (!query) return res.status(400).json({ error: 'Missing query parameter q' })
		const searchUrl = `http://10.0.0.238:9000/search?q=${encodeURIComponent(query)}`
		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), 10000)
		try {
			const response = await fetch(searchUrl, { signal: controller.signal })
			clearTimeout(timeout)
			if (!response.ok) {
				const errorText = await response.text().catch(() => '')
				console.error('Search API error:', response.status, errorText)
				return res.status(502).json({ error: 'Search service unavailable', status: response.status })
			}
			const data = await response.json()
			return res.json(data)
		} catch (fetchErr) {
			clearTimeout(timeout)
			if (fetchErr.name === 'AbortError') {
				return res.status(504).json({ error: 'Search request timeout' })
			}
			throw fetchErr
		}
	} catch (e) {
		console.error('GET /api/search error', e)
		res.status(500).json({ error: 'Search failed', message: e.message })
	}
})

app.post('/api/analytics/events', async (req, res) => {
	try {
		if (!fs.existsSync(ANALYTICS_DIR)) fs.mkdirSync(ANALYTICS_DIR, { recursive: true })
		const evt = {
			...req.body,
			serverTs: new Date().toISOString(),
			ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
		}
		fs.appendFileSync(ANALYTICS_FILE, JSON.stringify(evt) + '\n', 'utf-8')
		res.json({ ok: true })
	} catch (e) {
		console.error('POST /api/analytics/events error', e)
		res.status(500).json({ error: 'Failed to record event' })
	}
})

// --- Simple feedback & requests collection (file-backed) ---
const FEEDBACK_FILE = path.join(ANALYTICS_DIR, 'feedback.jsonl')
const REQUESTS_FILE = path.join(ANALYTICS_DIR, 'requests.jsonl')

app.post('/api/feedback', async (req, res) => {
    try {
        if (!fs.existsSync(ANALYTICS_DIR)) fs.mkdirSync(ANALYTICS_DIR, { recursive: true })
        const { uid = null, text = '', ts = new Date().toISOString() } = req.body || {}
        if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text required' })
        const rec = { type: 'feedback', uid, text, ts, ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress }
        fs.appendFileSync(FEEDBACK_FILE, JSON.stringify(rec) + '\n', 'utf-8')
        res.json({ ok: true })
    } catch (e) {
        res.status(500).json({ error: 'failed' })
    }
})

app.post('/api/requests', async (req, res) => {
    try {
        if (!fs.existsSync(ANALYTICS_DIR)) fs.mkdirSync(ANALYTICS_DIR, { recursive: true })
        const { uid = null, text = '', ts = new Date().toISOString() } = req.body || {}
        if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text required' })
        const rec = { type: 'request', uid, text, ts, ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress }
        fs.appendFileSync(REQUESTS_FILE, JSON.stringify(rec) + '\n', 'utf-8')
        res.json({ ok: true })
    } catch (e) {
        res.status(500).json({ error: 'failed' })
    }
})

// --- Analytics storage in MongoDB ---
// Collections: users, sessions, events
async function getAnalyticsCollections() {
    const client = await getClient()
    const db = client.db(MONGO_ANALYTICS_DB)
    const users = db.collection('Users')
    const sessions = db.collection('Sessions')
    const events = db.collection('Events')
    // Basic indices
    await users.createIndex({ uid: 1 }, { unique: true }).catch(()=>{})
    await users.createIndex({ lastActiveAt: -1 }).catch(()=>{})
    await sessions.createIndex({ sessionId: 1 }, { unique: true }).catch(()=>{})
    await sessions.createIndex({ uid: 1, startedAt: -1 }).catch(()=>{})
    await sessions.createIndex({ lastHeartbeatAt: -1 }).catch(()=>{})
    await events.createIndex({ uid: 1, ts: -1 }).catch(()=>{})
    return { users, sessions, events }
}

app.post('/api/analytics/identify', async (req, res) => {
    try {
        const { uid, tz, ua, clientTs } = req.body || {}
        if (!uid) return res.status(400).json({ error: 'uid required' })
        
        // Respond immediately - process async in background
        res.json({ ok: true })
        
        // Fire and forget - don't block response
        setImmediate(async () => {
            try {
                const { users } = await getAnalyticsCollections()
                const now = new Date().toISOString()
                await users.updateOne(
                    { uid },
                    {
                        $setOnInsert: { uid, firstSeenAt: clientTs || now },
                        $set: { tz, ua, lastActiveAt: now }
                    },
                    { upsert: true }
                )
            } catch (e) {
                console.error('POST /api/analytics/identify background error', e)
            }
        })
    } catch (e) {
        console.error('POST /api/analytics/identify error', e)
        res.json({ ok: true }) // Still respond OK even on error
    }
})

app.post('/api/analytics/session/start', async (req, res) => {
    try {
        const { uid, sessionId, tz, ua, clientTs } = req.body || {}
        if (!uid || !sessionId) return res.status(400).json({ error: 'uid and sessionId required' })
        
        // Respond immediately - process async in background
        res.json({ ok: true })
        
        // Fire and forget - don't block response
        setImmediate(async () => {
            try {
                const { users, sessions } = await getAnalyticsCollections()
                const now = new Date().toISOString()
                await users.updateOne({ uid }, { $set: { lastActiveAt: now }, $setOnInsert: { firstSeenAt: clientTs || now, tz, ua } }, { upsert: true })
                await sessions.updateOne(
                    { sessionId },
                    {
                        $setOnInsert: { sessionId, uid, tz, ua, startedAt: clientTs || now, visibleMs: 0 },
                        $set: { lastHeartbeatAt: now }
                    },
                    { upsert: true }
                )
            } catch (e) {
                console.error('POST /api/analytics/session/start background error', e)
            }
        })
    } catch (e) {
        console.error('POST /api/analytics/session/start error', e)
        res.json({ ok: true }) // Still respond OK even on error
    }
})

app.post('/api/analytics/session/heartbeat', async (req, res) => {
    try {
        const { uid, sessionId, clientTs, visibleMs } = req.body || {}
        if (!uid || !sessionId) return res.status(400).json({ error: 'uid and sessionId required' })
        
        // Respond immediately - process async in background
        res.json({ ok: true })
        
        // Fire and forget - don't block response
        setImmediate(async () => {
            try {
                const { users, sessions, events } = await getAnalyticsCollections()
                const now = new Date().toISOString()
                await users.updateOne({ uid }, { $set: { lastActiveAt: now } }, { upsert: true })
                await sessions.updateOne(
                    { sessionId },
                    { $set: { lastHeartbeatAt: now, visibleMs: Math.max(0, Number(visibleMs) || 0) } },
                    { upsert: true }
                )
                await events.insertOne({ type: 'heartbeat', uid, sessionId, ts: clientTs || now })
            } catch (e) {
                console.error('POST /api/analytics/session/heartbeat background error', e)
            }
        })
    } catch (e) {
        console.error('POST /api/analytics/session/heartbeat error', e)
        res.json({ ok: true }) // Still respond OK even on error
    }
})

app.post('/api/analytics/session/end', async (req, res) => {
    try {
        const { uid, sessionId, clientTs, visibleMs } = req.body || {}
        if (!uid || !sessionId) return res.status(400).json({ error: 'uid and sessionId required' })
        const { users, sessions, events } = await getAnalyticsCollections()
        const now = new Date().toISOString()
        await users.updateOne({ uid }, { $set: { lastActiveAt: now } }, { upsert: true })
        await sessions.updateOne(
            { sessionId },
            { $set: { endedAt: clientTs || now, visibleMs: Math.max(0, Number(visibleMs) || 0) } },
            { upsert: true }
        )
        await events.insertOne({ type: 'session_end', uid, sessionId, ts: clientTs || now, visibleMs: Math.max(0, Number(visibleMs) || 0) })
        res.json({ ok: true })
    } catch (e) {
        console.error('POST /api/analytics/session/end error', e)
        res.status(500).json({ error: 'session end failed' })
    }
})

// --- User saves (likes) ---
app.post('/api/user/like', async (req, res) => {
	try {
		const uid = (req.headers['x-uid'] || '').toString()
		const sessionId = (req.headers['x-sid'] || '').toString()
		const { idNumber, title, clientTs } = req.body || {}
		if (!uid) return res.status(400).json({ error: 'uid required' })
		if (idNumber == null) return res.status(400).json({ error: 'idNumber required' })
		const { users, events } = await getAnalyticsCollections()
		const now = new Date().toISOString()
		await users.updateOne(
			{ uid },
			{
				$set: { lastActiveAt: now },
				$setOnInsert: { firstSeenAt: clientTs || now }
			},
			{ upsert: true }
		)
		await users.updateOne(
			{ uid },
			{ $addToSet: { savedItems: { idNumber: Number(idNumber), title: title || null, addedAt: clientTs || now } } }
		)
		await events.insertOne({ type: 'like', uid, sessionId, idNumber: Number(idNumber), title: title || null, ts: clientTs || now })
		res.json({ ok: true })
	} catch (e) {
		console.error('POST /api/user/like error', e)
		res.status(500).json({ error: 'like failed' })
	}
})

app.post('/api/user/unlike', async (req, res) => {
	try {
		const uid = (req.headers['x-uid'] || '').toString()
		const sessionId = (req.headers['x-sid'] || '').toString()
		const { idNumber, title, clientTs } = req.body || {}
		if (!uid) return res.status(400).json({ error: 'uid required' })
		if (idNumber == null) return res.status(400).json({ error: 'idNumber required' })
		const { users, events } = await getAnalyticsCollections()
		const now = new Date().toISOString()
		await users.updateOne(
			{ uid },
			{ $pull: { savedItems: { idNumber: Number(idNumber) } } }
		)
		await events.insertOne({ type: 'unlike', uid, sessionId, idNumber: Number(idNumber), title: title || null, ts: clientTs || now })
		res.json({ ok: true })
	} catch (e) {
		console.error('POST /api/user/unlike error', e)
		res.status(500).json({ error: 'unlike failed' })
	}
})

app.get('/api/user/saved', async (req, res) => {
	try {
		const uid = (req.headers['x-uid'] || '').toString()
		if (!uid) return res.status(400).json({ error: 'uid required' })
		const { users } = await getAnalyticsCollections()
		const user = await users.findOne({ uid }, { projection: { savedItems: 1 } })
		const saved = Array.isArray(user?.savedItems) ? user.savedItems : []
		const idNums = saved.map((s) => Number(s.idNumber)).filter((n) => Number.isFinite(n))
		if (idNums.length === 0) return res.json({ items: [] })
		const client = await getClient()
		const col = client.db(MONGO_DB).collection(MONGO_COLLECTION)
		const cursor = col.aggregate([
			{ $unwind: '$AI_News' },
			{ $match: { 'AI_News.id_number': { $in: idNums } } },
			{ $project: { _id: 0, item: '$AI_News' } }
		])
		const found = await cursor.toArray()
		const items = found.map((d) => normalizeDetail(d.item))
		// Ensure all requested idNumbers are represented; include minimal fallback if not found
		const foundIds = new Set(items.map((it) => it.idNumber))
		for (const n of idNums) {
			if (!foundIds.has(n)) items.push({ id: n, idNumber: n, title: saved.find(s=>Number(s.idNumber)===n)?.title || `#${n}`, description: '', sourcesCount: 0, favicons: [], bgColor: null, bgColorDark: null, image: null, images: [], pageUrls: [], publishedAt: null })
		}
		items.sort((a,b)=> (b.idNumber||0)-(a.idNumber||0))
		res.json({ items })
	} catch (e) {
		console.error('GET /api/user/saved error', e)
		res.status(500).json({ error: 'saved failed' })
	}
})

// Summary analytics
app.get('/api/analytics/summary', async (req, res) => {
    try {
        const { users, sessions } = await getAnalyticsCollections()
        const now = Date.now()
        const fiveMinutesAgoIso = new Date(now - 5 * 60 * 1000).toISOString()
        const oneDayAgoIso = new Date(now - 24 * 60 * 60 * 1000).toISOString()

        const [totalUsers, activeNow, usersActiveLastDay] = await Promise.all([
            users.estimatedDocumentCount(),
            users.countDocuments({ lastActiveAt: { $gte: fiveMinutesAgoIso } }),
            users.countDocuments({ lastActiveAt: { $gte: oneDayAgoIso } })
        ])

        // Session aggregates
        const sessionsTodayCursor = sessions.aggregate([
            { $match: { startedAt: { $exists: true } } },
            { $project: {
                uid: 1,
                startedAt: { $toDate: '$startedAt' },
                endedAt: { $cond: [{ $ifNull: ['$endedAt', false] }, { $toDate: '$endedAt' }, null] },
                visibleMs: 1,
            }},
            { $addFields: {
                sessionMs: {
                    $cond: [
                        { $and: [ { $ifNull: ['$endedAt', false] }, { $gt: ['$endedAt', '$startedAt'] } ] },
                        { $subtract: ['$endedAt', '$startedAt'] },
                        0
                    ]
                }
            }},
            { $group: {
                _id: null,
                sessions: { $sum: 1 },
                totalSessionMs: { $sum: '$sessionMs' },
                totalVisibleMs: { $sum: { $ifNull: ['$visibleMs', 0] } }
            }}
        ])
        const sessionsAgg = await sessionsTodayCursor.next() || { sessions: 0, totalSessionMs: 0, totalVisibleMs: 0 }

        // First registered timestamp
        const firstUser = await users.find().sort({ firstSeenAt: 1 }).limit(1).toArray()
        const firstRegisteredAt = firstUser[0]?.firstSeenAt || null

        res.json({
            totalUsers,
            activeNow,
            usersActiveLastDay,
            firstRegisteredAt,
            sessions: sessionsAgg.sessions,
            totalSessionMs: sessionsAgg.totalSessionMs,
            totalVisibleMs: sessionsAgg.totalVisibleMs
        })
    } catch (e) {
        console.error('GET /api/analytics/summary error', e)
        res.status(500).json({ error: 'summary failed' })
    }
})

app.get('/api/news/chunk-by-id/:idNumber', async (req, res) => {
	try {
		const size = Math.max(1, Math.min(50, Number(req.query.size) || 6))
		const count = Math.max(1, Math.min(5, Number(req.query.count) || 3))
		const capNewer = String(req.query.cap_newer || 'true') === 'true'
		const idNum = Number(req.params.idNumber)
		if (!Number.isInteger(idNum)) return res.status(400).json({ error: 'Invalid id_number' })
        let hay = await loadHaystack(5000)
		hay = hay.map(normalizeItem).filter(item => item.idNumber != null)
		hay.sort((a, b) => (b.idNumber || 0) - (a.idNumber || 0))
		const totalItems = hay.length
		const totalChunks = Math.ceil(totalItems / size)
		let idx = hay.findIndex(a => a.idNumber === idNum)
		// Fallback to nearest lower id if exact id not present
		if (idx < 0) {
			idx = hay.findIndex(a => (a.idNumber || 0) <= idNum)
			if (idx < 0) return res.status(404).json({ error: 'Not found' })
		}
		const startChunk = Math.floor(idx / size)
		const chunks = []
		// Load chunks both before and after the target chunk for better deep linking
		// Load 'count' chunks starting from target, and also load 1 chunk before if available
		const chunksToLoad = Math.max(1, count)
		const chunksBefore = Math.min(1, startChunk) // Load 1 chunk before if available
		const startFrom = Math.max(0, startChunk - chunksBefore)
		const endAt = Math.min(startFrom + chunksBefore + chunksToLoad, totalChunks)
		for (let c = startFrom; c < endAt; c++) {
			const from = c * size
			const to = Math.min(from + size, totalItems)
			let items = hay.slice(from, to)
			// If capNewer is true, filter out items newer than the requested id
			if (capNewer) items = items.filter(it => (it?.idNumber ?? 0) <= idNum)
			chunks.push({ chunkIndex: c, items })
		}
		return res.json({ totalItems, totalChunks, size, start: startChunk, count: chunks.length, chunks })
	} catch (e) {
		console.error('GET /api/news/chunk-by-id error', e)
		res.status(500).json({ error: 'Failed to load chunk' })
	}
})

app.get('/auth/callback', async (req, res) => {
	try {
		const code = (req.query.code || '').toString()
		if (!code) return res.redirect('/?auth=cancelled')
		const clientId = process.env.GOOGLE_CLIENT_ID || ''
		const clientSecret = process.env.GOOGLE_CLIENT_SECRET || ''
		const redirectUri = process.env.GOOGLE_REDIRECT_URI || (req.protocol + '://' + req.get('host') + '/auth/callback')
		const body = new URLSearchParams()
		body.set('code', code)
		body.set('client_id', clientId)
		body.set('client_secret', clientSecret)
		body.set('redirect_uri', redirectUri)
		body.set('grant_type', 'authorization_code')
		const tokenResp = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
		if (!tokenResp.ok) return res.redirect('/?auth=error')
		const tokenJson = await tokenResp.json().catch(()=>null)
		const accessToken = tokenJson?.access_token || ''
		if (!accessToken) return res.redirect('/?auth=error')
		// Fetch userinfo
		const userInfoResp = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } })
		if (!userInfoResp.ok) return res.redirect('/?auth=error')
		const userInfo = await userInfoResp.json().catch(()=>null)
		const email = userInfo?.email || null
		const name = userInfo?.name || null
		const picture = userInfo?.picture || null
		const locale = userInfo?.locale || null
		// Extract uid from cookies
		let uid = null
		try {
			const raw = req.headers.cookie || ''
			const parts = raw.split(';').map(s => s.trim())
			for (const p of parts) { if (p.startsWith('uid=')) { uid = decodeURIComponent(p.slice(4)); break } }
		} catch {}
		// Upsert user profile
		try {
			const client = await getClient()
			const col = client.db(MONGO_ANALYTICS_DB).collection('Users')
			const now = new Date().toISOString()
			await col.updateOne(
				{ uid },
				{ $set: { uid, email, name, picture, locale, updatedAt: now }, $setOnInsert: { createdAt: now } },
				{ upsert: true }
			)
		} catch {}
		// Mark authenticated for the browser using a simple cookie
		try {
			res.setHeader('Set-Cookie', [
				`hasAuth=1; Path=/; Max-Age=${60*60*24*7}; SameSite=Lax`
			])
		} catch {}
		return res.redirect('/?auth=ok')
	} catch (e) {
		return res.redirect('/?auth=error')
	}
})

app.get('/api/user/me', async (req, res) => {
	try {
		let uid = null
		try {
			const raw = req.headers.cookie || ''
			const parts = raw.split(';').map(s => s.trim())
			for (const p of parts) { if (p.startsWith('uid=')) { uid = decodeURIComponent(p.slice(4)); break } }
		} catch {}
		if (!uid) return res.json({ ok: false })
		let user = null
		try {
			const client = await getClient()
			const col = client.db(MONGO_ANALYTICS_DB).collection('Users')
			user = await col.find({ uid }).project({ _id: 0, uid: 1, email: 1, name: 1, picture: 1, locale: 1, updatedAt: 1 }).limit(1).next()
		} catch {}
		return res.json({ ok: true, user: user || { uid } })
	} catch {
		return res.json({ ok: false })
	}
})

app.get('/api/admin/users/emails', async (req, res) => {
	try {
		const client = await getClient()
		const col = client.db(MONGO_ANALYTICS_DB).collection('Users')
        const docs = await col.find({ email: { $exists: true, $ne: null } }).project({ _id: 0, email: 1, name: 1, uid: 1, updatedAt: 1 }).limit(2000).toArray()
        // Deduplicate by email (case-insensitive)
        const seen = new Set()
        const users = []
        for (const u of docs) {
            const e = (u?.email || '').toLowerCase()
            if (!e || seen.has(e)) continue
            seen.add(e)
            users.push(u)
        }
        const emails = users.map(u => u.email)
        return res.json({ ok: true, count: emails.length, emails, users })
	} catch (e) {
		return res.status(500).json({ ok: false })
	}
})

// Authenticated admin API: GET /api/admin/emails
// - Basic Auth header (Authorization: Basic base64(user:pass)) OR
// - Query params (?username=...&password=...)
// Uses env ADMIN_USER / ADMIN_PASS
function parseBasicAuth(req) {
    try {
        const h = req.headers.authorization || ''
        if (!h.toLowerCase().startsWith('basic ')) return null
        const b64 = h.slice(6).trim()
        const raw = Buffer.from(b64, 'base64').toString('utf8')
        const idx = raw.indexOf(':')
        if (idx < 0) return null
        return { username: raw.slice(0, idx), password: raw.slice(idx + 1) }
    } catch { return null }
}

app.get('/api/admin/emails', async (req, res) => {
    try {
        const AUSER = process.env.ADMIN_USER || ''
        const APASS = process.env.ADMIN_PASS || ''
        let creds = parseBasicAuth(req)
        if (!creds) {
            const quser = (req.query.username || '').toString()
            const qpass = (req.query.password || '').toString()
            if (quser || qpass) creds = { username: quser, password: qpass }
        }
        if (!AUSER || !APASS || !creds || creds.username !== AUSER || creds.password !== APASS) {
            res.setHeader('WWW-Authenticate', 'Basic realm="Admin"')
            return res.status(401).json({ ok: false, error: 'unauthorized' })
        }
        const client = await getClient()
        const col = client.db(MONGO_ANALYTICS_DB).collection('Users')
        const docs = await col.find({ email: { $exists: true, $ne: null } }).project({ _id: 0, email: 1, name: 1, uid: 1, updatedAt: 1 }).limit(2000).toArray()
        const seen = new Set()
        const users = []
        for (const u of docs) {
            const e = (u?.email || '').toLowerCase()
            if (!e || seen.has(e)) continue
            seen.add(e)
            users.push(u)
        }
        const emails = users.map(u => u.email)
        return res.json({ ok: true, count: emails.length, emails, users })
    } catch (e) {
        return res.status(500).json({ ok: false })
    }
})

// Integrate Vite dev server (middleware) in development, serve built assets in production
function isPortAvailable(port) {
	return new Promise((resolve) => {
		const tester = net.createServer()
			.once('error', () => resolve(false))
			.once('listening', () => tester.once('close', () => resolve(true)).close())
			.listen(port, '0.0.0.0')
	})
}

async function findAvailablePort(startPort, maxAttempts = 10) {
	let port = startPort
	for (let i = 0; i < maxAttempts; i++) {
		// eslint-disable-next-line no-await-in-loop
		const free = await isPortAvailable(port)
		if (free) return port
		port += 1
	}
	return startPort
}

async function start() {
	try {
		const rootDir = path.resolve(__dirname, '..')
		const lanIp = (() => {
			try {
				const nics = os.networkInterfaces()
				for (const name of Object.keys(nics)) {
					for (const nic of nics[name] || []) {
						if (nic && nic.family === 'IPv4' && !nic.internal) return nic.address
					}
				}
			} catch {}
			return null
		})()
		if (!IS_PROD) {
			// Choose an available port starting from PORT
			const desiredPort = Number(process.env.PORT) || PORT
			const port = await findAvailablePort(desiredPort)
			// Create HTTP server upfront so Vite HMR can attach to it without opening its own WS port
			const httpServer = http.createServer(app)
			const vite = await createViteServer({
				root: rootDir,
				appType: 'spa',
				server: {
					middlewareMode: true,
					hmr: { server: httpServer },
					watch: { ignored: ['**/server/**'] },
					allowedHosts: ['newui.resnet.in']
				}
			})
			// Mount Vite middlewares AFTER API routes so /api is handled by Express
			app.use(vite.middlewares)
			httpServer.listen(port, '0.0.0.0', () => {
				console.log('Unified server listening on:')
				console.log(`  Local:   http://localhost:${port}`)
				if (lanIp) console.log(`  Network: http://${lanIp}:${port}`)
			})
			return
		} else {
			const distDir = path.join(rootDir, 'dist')
			const ONE_YEAR_S = 31536000
			app.use(express.static(distDir, {
				maxAge: ONE_YEAR_S * 1000,
				setHeaders: (res, filePath) => {
					if (filePath.endsWith('index.html')) {
						res.setHeader('Cache-Control', 'no-cache')
					} else {
						res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
					}
				}
			}))
			app.get('*', (req, res) => {
				res.sendFile(path.join(distDir, 'index.html'))
			})
		}
		// Production: use fixed PORT or fallback if needed
		const desiredPort = Number(process.env.PORT) || PORT
		const port = await findAvailablePort(desiredPort)
		app.listen(port, '0.0.0.0', () => {
			console.log('Unified server listening on:')
			console.log(`  Local:   http://localhost:${port}`)
			if (lanIp) console.log(`  Network: http://${lanIp}:${port}`)
		})
	} catch (e) {
		console.error('Failed to start server', e)
		process.exit(1)
	}
}

start()