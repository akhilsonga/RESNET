import React, { useState } from 'react'
import './chips.mobile.scss'

const CATEGORIES = [
	'Tech & Science',
	'Finance',
	'Arts & Culture',
	'Sports',
	'World',
	'Health',
	'Business'
]

export default function CategoryChips() {
	const [active, setActive] = useState(CATEGORIES[0])
	return (
		<div className="chips-scroll" role="tablist" aria-label="Categories">
			{CATEGORIES.map((c) => (
				<button
					key={c}
					className={`chip ${active === c ? 'active' : ''}`}
					role="tab"
					aria-selected={active === c}
					onClick={() => setActive(c)}
				>
					{c}
				</button>
			))}
		</div>
	)
} 