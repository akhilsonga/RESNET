import React from 'react'

export default function Sidebar() {
	return (
		<aside className="d-sidebar">
			<nav className="nav">
				<a className="nav-item active" href="#">Discover</a>
				<a className="nav-item" href="#">Trending</a>
				<a className="nav-item" href="#">Saved</a>
				<a className="nav-item" href="#">Settings</a>
			</nav>
		</aside>
	)
}

