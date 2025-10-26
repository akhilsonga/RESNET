import React from 'react'

export default function InstallModal({ open, onClose, onInstall, onEnable, onLogin, canInstall = false, canEnable = false, isIOS = false, isAuthenticated = false }) {
	if (!open) return null
	
	// If user is not authenticated, show login modal
	if (!isAuthenticated) {
		return (
			<div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
				<div className="modal-card" onClick={(e)=>e.stopPropagation()}>
					<h3 className="modal-title">Login Required</h3>
					<p className="modal-sub">
						<span>Please login with your Google account to continue.</span>
					</p>
					<div className="modal-actions">
						<button id="btnLogin" className="modal-btn modal-btn--primary" onClick={onLogin}>
							Login with Google
						</button>
						<button className="modal-btn modal-btn--ghost" onClick={onClose}>Close</button>
					</div>
				</div>
			</div>
		)
	}
	
	// If authenticated, show notification enable modal
	return (
		<div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
			<div className="modal-card" onClick={(e)=>e.stopPropagation()}>
				<h3 className="modal-title">Enable notifications</h3>
				<p className="modal-sub">
					{isIOS ? (
						<span>Add this app to your Home Screen to receive notifications.</span>
					) : (
						<span>Install the app to receive notifications.</span>
					)}
				</p>
				<div className="modal-actions">
					{canInstall && (
						<button className="modal-btn" onClick={onInstall}>Add to Home Screen</button>
					)}
					<button className="modal-btn modal-btn--primary" onClick={onEnable} disabled={!canEnable}>
						Enable notifications
					</button>
					<button className="modal-btn modal-btn--ghost" onClick={onClose}>Close</button>
				</div>
			</div>
		</div>
	)
} 