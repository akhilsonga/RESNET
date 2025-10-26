// Minimal cookie helpers (no external deps)
export function setCookie(name, value, days = 7) {
	try {
		const d = new Date()
		d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000)
		const expires = `expires=${d.toUTCString()}`
		document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)};${expires};path=/;SameSite=Lax`
	} catch {}
}

export function getCookie(name) {
	try {
		const key = encodeURIComponent(name) + '='
		const ca = document.cookie.split(';')
		for (let c of ca) {
			while (c.charAt(0) === ' ') c = c.substring(1)
			if (c.indexOf(key) === 0) return decodeURIComponent(c.substring(key.length, c.length))
		}
		return null
	} catch { return null }
}

export function deleteCookie(name) {
	try { document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;` } catch {}
}


