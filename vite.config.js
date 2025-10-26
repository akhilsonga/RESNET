import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
	plugins: [react()],
	server: {
		port: 5173,
		open: false,
		allowedHosts: ['newui.resnet.in'],
		proxy: {
			'/api': {
				target: 'http://localhost:8080',
				changeOrigin: true
			}
		}
	},
	preview: {
		port: 4173
	},
	build: {
		minify: 'terser',
		cssMinify: true,
		modulePreload: true,
		target: 'es2019',
		sourcemap: false,
		rollupOptions: {
			output: {
				manualChunks: {
					'vendor-react': ['react', 'react-dom'],
					'router': ['react-router-dom']
				}
			}
		}
	},
	define: { 'process.env.NODE_ENV': JSON.stringify('production') }
}) 