self.addEventListener('install', (event) => {
	self.skipWaiting()
	event.waitUntil(
		caches.open('discover-v2').then(() => {})
	)
})

self.addEventListener('activate', (event) => {
	event.waitUntil((async () => {
		const keys = await caches.keys()
		await Promise.all(keys.filter(k => k !== 'discover-v2').map(k => caches.delete(k)))
		await self.clients.claim()
	})())
})

self.addEventListener('fetch', (event) => {
	const { request } = event
	if (request.method !== 'GET') return
	const url = new URL(request.url)
	// Always bypass cache for API/JSON requests
	if (url.pathname.startsWith('/api/')) {
		return event.respondWith(fetch(request, { cache: 'no-store' }))
	}
	// For navigations, go network-first to avoid stale HTML/app shell
	if (request.mode === 'navigate') {
		return event.respondWith(
			fetch(request).catch(() => caches.match('/index.html'))
		)
	}
	// For other assets, prefer network-first, fallback to cache
	event.respondWith(
		fetch(request).then((resp) => {
			const clone = resp.clone()
			caches.open('discover-v2').then((cache) => cache.put(request, clone)).catch(()=>{})
			return resp
		}).catch(() => caches.match(request))
	)
})

self.addEventListener('push', (event) => {
	const data = event.data ? event.data.json() : { title: 'Update', body: '' }
	const origin = self.location.origin || ''
	const toAbs = (p)=>{ try { if (!p) return null; if (/^https?:\/\//i.test(p)) return p; return origin + p } catch { return null } }
	const iconUrl = toAbs(data.icon) || (origin + '/space-shuttle.png')
	event.waitUntil(
		self.registration.showNotification(data.title || 'Update', {
			body: data.body || '',
			icon: iconUrl,
			badge: iconUrl
		})
	)
})

self.addEventListener('notificationclick', (event) => {
	event.notification.close()
	event.waitUntil((async () => {
		try {
			const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
			for (const client of allClients) {
				if ('focus' in client) { await client.focus(); return }
			}
			if (self.clients.openWindow) {
				await self.clients.openWindow('/')
			}
		} catch {}
	})())
})

self.addEventListener('pushsubscriptionchange', (event) => {
	event.waitUntil((async () => {
		try {
			const appServerKeyRes = await fetch('/api/push/public-key')
			if (!appServerKeyRes.ok) return
			const { key } = await appServerKeyRes.json()
			const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: (function urlBase64ToUint8Array(base64String){const padding='='.repeat((4-base64String.length%4)%4);const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');const rawData=atob(base64);const outputArray=new Uint8Array(rawData.length);for(let i=0;i<rawData.length;++i)outputArray[i]=rawData.charCodeAt(i);return outputArray})(key) })
			await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub }) })
		} catch {}
	})())
}) 