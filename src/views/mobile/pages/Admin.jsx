import React from 'react'

export default function Admin() {
    const [username, setUsername] = React.useState('')
    const [password, setPassword] = React.useState('')
    const [isAuthed, setIsAuthed] = React.useState(false)
    const [loading, setLoading] = React.useState(false)
    const [error, setError] = React.useState('')
    const [users, setUsers] = React.useState([])

    const handleLogin = (e) => {
        e.preventDefault()
        setError('')
        if (username === 'akhilsonga' && password === 'Akhilsonga@1') {
            setIsAuthed(true)
        } else {
            setError('Invalid credentials')
        }
    }

    React.useEffect(() => {
        if (!isAuthed) return
        setLoading(true)
        ;(async () => {
            try {
                const r = await fetch('/api/admin/users/emails', { cache: 'no-store' })
                if (!r.ok) throw new Error('Failed to load users')
                const d = await r.json()
                if (d && d.ok && Array.isArray(d.users)) {
                    // Deduplicate by email
                    const seen = new Set()
                    const uniq = []
                    for (const u of d.users) {
                        const email = u?.email || ''
                        if (!email) continue
                        if (seen.has(email)) continue
                        seen.add(email)
                        uniq.push(u)
                    }
                    setUsers(uniq)
                } else {
                    setUsers([])
                }
            } catch (e) {
                setError('Could not fetch users')
            } finally {
                setLoading(false)
            }
        })()
    }, [isAuthed])

    if (!isAuthed) {
        return (
            <div style={{ padding: 16 }}>
                <h2 style={{ margin: 0, marginBottom: 12 }}>Admin Login</h2>
                <form onSubmit={handleLogin}>
                    <div style={{ display: 'grid', gap: 8, maxWidth: 360 }}>
                        <input
                            type="text"
                            placeholder="Username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            autoComplete="username"
                            style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
                        />
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                            style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
                        />
                        {error && <div className="text-muted" role="alert" style={{ color: 'var(--danger, #dc2626)' }}>{error}</div>}
                        <button type="submit" className="chip" style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)', width: 140 }}>Login</button>
                    </div>
                </form>
            </div>
        )
    }

    return (
        <div style={{ padding: 16 }}>
            <h2 style={{ margin: 0 }}>Admin</h2>
            <div className="text-muted" style={{ marginTop: 6 }}>Unique users: {users.length}</div>
            <div style={{ marginTop: 12 }}>
                {loading && <div className="text-muted">Loading…</div>}
                {!loading && users.length === 0 && <div className="text-muted">No users</div>}
                {!loading && users.length > 0 && (
                    <ul style={{ padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
                        {users.map((u, i) => (
                            <li key={i} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
                                <div style={{ fontWeight: 700 }}>{u.name || '(no name)'}</div>
                                <div className="text-muted" style={{ wordBreak: 'break-all' }}>{u.email}</div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}





