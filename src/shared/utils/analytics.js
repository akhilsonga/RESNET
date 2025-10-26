import { getOrCreateUserId } from './userId'

function postJson(url, body) {
	try {
		return fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		}).catch(()=>{})
	} catch {
		return Promise.resolve()
	}
}

function nowIso() {
	try { return new Date().toISOString() } catch { return null }
}

function generateSessionId() {
	return 's_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export async function subscribeToPushIfPossible() {
	try {
		if (!('serviceWorker' in navigator)) return null
		const reg = await navigator.serviceWorker.ready
		if (!reg || !('pushManager' in reg)) return null
		// Reuse existing subscription if present
		let sub = await reg.pushManager.getSubscription()
		if (!sub) {
			const vapidRes = await fetch('/api/push/public-key')
			if (!vapidRes.ok) return null
			const { key } = await vapidRes.json()
			sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) })
		}
		const uid = getOrCreateUserId()
		await postJson('/api/push/subscribe', { uid, subscription: sub })
		return sub
	} catch { return null }
}

export async function pingServerPushDemo(uid, payload) {
	try {
		const res = await fetch('/api/push/ping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid, ...payload }) })
		if (res.status === 404) {
			await subscribeToPushIfPossible()
			await fetch('/api/push/ping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid, ...payload }) })
		}
	} catch {}
}

function urlBase64ToUint8Array(base64String) {
	const padding = '='.repeat((4 - base64String.length % 4) % 4)
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
	const rawData = atob(base64)
	const outputArray = new Uint8Array(rawData.length)
	for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
	return outputArray
}

export function initAnalytics() {
	let uid = null
	let sessionId = null
	let heartbeatTimer = null
	let visibilityStart = null
	let accumulatedVisibleMs = 0

	function isVisible() {
		try { return document.visibilityState === 'visible' } catch { return true }
	}

	function onVisibilityChange() {
		if (isVisible()) {
			visibilityStart = Date.now()
		} else if (visibilityStart != null) {
			accumulatedVisibleMs += Date.now() - visibilityStart
			visibilityStart = null
		}
	}

	async function startSession() {
		uid = getOrCreateUserId()
		sessionId = generateSessionId()
		try { sessionStorage.setItem('sid', sessionId) } catch {}
		const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
		const ua = navigator.userAgent || ''
		
		// Fire and forget - don't block app initialization
		postJson('/api/analytics/identify', { uid, tz, ua, clientTs: nowIso() })
		postJson('/api/analytics/session/start', { uid, sessionId, tz, ua, clientTs: nowIso() })
		
		visibilityStart = Date.now()
		
		// Defer first heartbeat to avoid blocking critical path
		setTimeout(() => {
			heartbeatTimer = setInterval(() => {
				let visibleMs = accumulatedVisibleMs
				if (visibilityStart != null && isVisible()) {
					visibleMs += Date.now() - visibilityStart
				}
				postJson('/api/analytics/session/heartbeat', { uid, sessionId, clientTs: nowIso(), visibleMs })
			}, 15000)
		}, 5000) // Wait 5 seconds before starting heartbeat
	}

	function endSession() {
		try { if (heartbeatTimer) clearInterval(heartbeatTimer) } catch {}
		if (visibilityStart != null && isVisible()) {
			accumulatedVisibleMs += Date.now() - visibilityStart
			visibilityStart = null
		}
		postJson('/api/analytics/session/end', { uid, sessionId, clientTs: nowIso(), visibleMs: accumulatedVisibleMs })
	}

	try {
		document.addEventListener('visibilitychange', onVisibilityChange)
		window.addEventListener('beforeunload', endSession)
		startSession()
	} catch {
		// ignore
	}

	return {
		get uid() { return uid },
		get sessionId() { return sessionId },
		end: endSession
	}
}


