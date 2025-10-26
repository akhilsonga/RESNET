import React, { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import DiscoverDesktop from './pages/DiscoverDesktop'
import ArticleDesktop from './pages/ArticleDesktop'
import AppHeader from './sections/AppHeader'
import Sidebar from './sections/Sidebar'
import { Send, Copy, Share2, RefreshCw, Search, Globe, Settings, Paperclip, Mic, ArrowRight } from 'lucide-react'
import './desktop.layout.scss'

const Admin = lazy(() => import('../mobile/pages/Admin'))

function ChatbotUI({ onResize }) {
    const [width, setWidth] = React.useState(360)
    const isResizing = React.useRef(false)

    React.useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isResizing.current) return
            const newWidth = window.innerWidth - e.clientX
            if (newWidth >= 280 && newWidth <= window.innerWidth * 0.5) {
                setWidth(newWidth)
            }
            if (onResize) onResize(newWidth)
        }

        const handleMouseUp = () => {
            isResizing.current = false
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)

        return () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
        }
    }, [])

    const handleMouseDown = () => {
        isResizing.current = true
        document.body.style.cursor = 'ew-resize'
        document.body.style.userSelect = 'none'
    }
    
    return (
        <>
            <div className="resize-handle" onMouseDown={handleMouseDown} />
            <div className="chatbot">
                
                <div className="messages" aria-label="Suggestions">
                    <div className="suggestions">
                        <div className="suggestion-card">
                            <img 
                                className="suggestion-image"
                                src="https://newui.resnet.in/img?u=https%3A%2F%2Fcdn.mos.cms.futurecdn.net%2FFsFrY2UWB88KMbXUrqV5GD.jpg&w=640" 
                                alt=""
                            />
                            <div className="suggestion-content">
                                <h4 className="suggestion-title">OpenAI Launches Sora 2 and Sora 2 Pro</h4>
                                <p className="suggestion-desc">Hyper-realistic video generation with advanced AI</p>
                            </div>
                        </div>

                        <div className="suggestion-card">
                            <img 
                                className="suggestion-image"
                                src="https://newui.resnet.in/img?u=https%3A%2F%2Fnews.mit.edu%2Fsites%2Fdefault%2Ffiles%2Fimages%2F202509%2Fconcrete-arch-00_0.png&w=640" 
                                alt=""
                            />
                            <div className="suggestion-content">
                                <h4 className="suggestion-title">MIT Develops ec³ Concrete</h4>
                                <p className="suggestion-desc">Electron conducting carbon concrete for energy storage</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="composer">
                    <div className="composer-input-wrap variant-rect" role="group" aria-label="Ask anything">
                        <textarea id="qa-input" placeholder="Ask anything… (Shift+Enter to send)" rows="1" onInput={(e)=>{
                            const el = e.currentTarget
                            el.style.height = 'auto'
                            const max = 200
                            el.style.height = Math.min(el.scrollHeight, max) + 'px'
                        }} />
                        <div className="composer-toolbar">
                            <button className="chip"><Search size={14} /> <span>Search</span></button>
                            <button className="icon" aria-label="Region"><Globe size={16} /></button>
                            <button className="icon" aria-label="Settings"><Settings size={16} /></button>
                            <button className="icon" aria-label="Attach"><Paperclip size={16} /></button>
                            <button className="icon" aria-label="Voice"><Mic size={16} /></button>
                            <button className="go" aria-label="Send (Shift+Enter)" title="Send (Shift+Enter)"><ArrowRight size={16} /></button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

export default function DesktopApp() {
    const [rightWidth, setRightWidth] = React.useState(360)
    return (
        <BrowserRouter>
            <Suspense fallback={<div style={{ padding: 12 }}>Loading…</div>}>
                <Routes>
                    <Route path="/admin" element={(
                        <div className="d-shell">
                            <AppHeader />
                            <div className="d-main">
                                <main className="d-content" style={{ width: '100%' }}>
                                    <Admin />
                                </main>
                            </div>
                        </div>
                    )} />
                    <Route path="/article/:id" element={(
                        <div className="d-shell">
                            <AppHeader />
                            <div className="d-main">
                                <Sidebar />
                                <main className="d-content">
                                    <ArticleDesktop />
                                </main>
                                <aside className="d-right">
                                    <div className="right-top">
                                        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Related Topics</h4>
                                    </div>
                                    <div className="right-bottom">
                                        <ChatbotUI />
                                    </div>
                                </aside>
                            </div>
                        </div>
                    )} />
                    <Route path="*" element={(
                        <div className="d-shell">
                            <AppHeader />
                            <div className="d-main">
                                <Sidebar />
                                <main className="d-content">
                                    <DiscoverDesktop />
                                </main>
                                <aside className="d-right">
                                    <div className="right-top">
                                        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Related Topics</h4>
                                    </div>
                                    <div className="right-bottom">
                                        <ChatbotUI />
                                    </div>
                                </aside>
                            </div>
                        </div>
                    )} />
                </Routes>
            </Suspense>
        </BrowserRouter>
    )
}