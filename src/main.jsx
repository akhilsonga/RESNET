import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './root/App'
import './styles/index.scss'

const root = createRoot(document.getElementById('root'))
root.render(<React.StrictMode><App /></React.StrictMode>)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('/sw.js').catch(()=>{})
	})
} 