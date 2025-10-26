import React from 'react'

export default function SectionHeader({ title }) {
	return (
		<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '8px 0 16px' }}>
			<h2 style={{ margin: 0 }}>{title}</h2>
		</div>
	)
} 