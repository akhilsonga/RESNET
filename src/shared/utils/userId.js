export function getOrCreateUserId() {
	try {
		const key = 'uid'
		let id = localStorage.getItem(key)
		if (!id) {
			id = 'u_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
			localStorage.setItem(key, id)
			document.cookie = `uid=${id}; path=/; max-age=${60*60*24*7}`
		}
		return id
	} catch {
		return 'u_' + Math.random().toString(36).slice(2)
	}
} 