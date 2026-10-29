import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Asterisk, MessageSquare, Users, Settings, Search, Plus, MoreVertical,
  Paperclip, Smile, Send, Check, CheckCheck, Lock, X, Trash2, FileText,
} from 'lucide-react'
import useLocalStorage from './useLocalStorage'
import './App.css'

/* ---------- helpers ---------- */
const MIN = 60000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const pad = (n) => String(n).padStart(2, '0')
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const COLORS = ['blue', 'peach', 'lavender', 'mint', 'rose', 'sky']
const EMOJIS = ['😀', '😂', '😍', '🥰', '😎', '🤔', '😅', '😭', '👍', '🙏', '🔥', '🎉', '❤️', '✨', '🚀', '👀', '💯', '😴', '🤝', '👋']
const REPLIES = [
  'Haha nice 😄', 'Got it 👍', 'That sounds great!', 'Tell me more!',
  'Let me check and get back to you.', 'Awesome 🎉', 'Can we talk about it tomorrow?',
  'Sure, works for me.', 'Love that idea ✨',
]

const fmtTime = (ts) => {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const startOfDay = (ts) => {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
const dayDiff = (ts) => Math.round((startOfDay(Date.now()) - startOfDay(ts)) / DAY)

function listTime(ts) {
  const d = dayDiff(ts)
  if (d === 0) return fmtTime(ts)
  if (d === 1) return 'Yesterday'
  if (d < 7) return new Date(ts).toLocaleDateString('en-US', { weekday: 'short' })
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
function dayLabel(ts) {
  const d = dayDiff(ts)
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}
function lastSeenText(ts) {
  const diff = Date.now() - ts
  if (diff < MIN) return 'just now'
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m ago`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`
  return `${dayDiff(ts)}d ago`
}
const initials = (name) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
const lastTs = (c) => c.messages.at(-1)?.ts ?? c.createdAt ?? 0
const fileSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

function previewOf(c) {
  const last = c.messages.at(-1)
  if (!last) return 'Say hi 👋'
  const body = last.file ? `📎 ${last.file.name}` : last.text
  return (last.from === 'me' ? 'You: ' : '') + body
}

function makeSeed() {
  const now = Date.now()
  const m = (from, text, ago) => ({ id: uid(), from, text, ts: now - ago, status: 'read' })
  return [
    { id: 'alex', name: 'Alex Morgan', color: 'blue', online: true, lastSeen: now, unread: 0, messages: [
      m('them', 'Hey! How are you doing?', 32 * MIN),
      m('me', 'Doing great! Working on my new chat app.', 28 * MIN),
      m('them', 'That sounds exciting! 😍', 26 * MIN),
      m('me', 'Yes! Clean UI and real-time messaging 🚀', 24 * MIN),
    ] },
    { id: 'priya', name: 'Priya Sharma', color: 'peach', online: false, lastSeen: now - 3 * HOUR, unread: 0, messages: [
      m('me', 'Did you see the new design?', 5 * HOUR),
      m('them', 'That sounds great! 😍', 4 * HOUR),
    ] },
    { id: 'jordan', name: 'Jordan Lee', color: 'lavender', online: false, lastSeen: now - DAY, unread: 0, messages: [
      m('them', 'Sent you the photos', DAY + HOUR),
    ] },
    { id: 'sam', name: 'Sam Wilson', color: 'mint', online: true, lastSeen: now, unread: 0, messages: [
      m('me', 'Here is the report.', DAY + 2 * HOUR),
      m('them', 'Thanks!', DAY + HOUR),
    ] },
    { id: 'team', name: 'Team ChitChat', color: 'sky', online: false, lastSeen: now - 2 * HOUR, unread: 2, messages: [
      m('them', 'Release notes are up.', DAY + 3 * HOUR),
      m('them', 'New update is live!', DAY + 2 * HOUR),
    ] },
    { id: 'rohan', name: 'Rohan Das', color: 'rose', online: false, lastSeen: now - 2 * DAY, unread: 1, messages: [
      m('them', 'Call at 6?', 3 * DAY),
    ] },
    { id: 'sneha', name: 'Sneha Roy', color: 'peach', online: false, lastSeen: now - 4 * DAY, unread: 0, messages: [
      m('them', 'See you tomorrow!', 4 * DAY),
    ] },
  ]
}

/* ---------- small components ---------- */
function Avatar({ chat, size = 44 }) {
  return (
    <div className={`avatar av-${chat.color}`} style={{ width: size, height: size, fontSize: size * 0.3 }}>
      {initials(chat.name)}
      {chat.online && <span className="dot" />}
    </div>
  )
}

function Splash({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1900)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div className="splash">
      <div className="splash-content">
        <div className="logo"><Asterisk size={30} /></div>
        <h1>ChitChat</h1>
      </div>
    </div>
  )
}

function Ticks({ status }) {
  if (status === 'sent') return <Check size={14} className="tick" />
  return <CheckCheck size={14} className={`tick ${status === 'read' ? 'read' : ''}`} />
}

/* ---------- app ---------- */
export default function App() {
  const [chats, setChats] = useLocalStorage('chitchat:chats', makeSeed)
  const [theme, setTheme] = useLocalStorage('chitchat:theme', 'light')
  const [myName, setMyName] = useLocalStorage('chitchat:name', 'You')

  const [splash, setSplash] = useState(true)
  const [view, setView] = useState('messages')
  const [activeId, setActiveId] = useState(() => chats[0]?.id ?? null)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [chatQuery, setChatQuery] = useState('')
  const [typingId, setTypingId] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')

  const hideSplash = useCallback(() => setSplash(false), [])
  const endRef = useRef(null)
  const inputRef = useRef(null)
  const fileRef = useRef(null)
  const timers = useRef([])
  const chatsRef = useRef(chats)
  const activeRef = useRef(activeId)
  const viewRef = useRef(view)
  chatsRef.current = chats
  activeRef.current = activeId
  viewRef.current = view

  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const active = chats.find((c) => c.id === activeId) ?? null

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [active?.messages.length, typingId, activeId])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setShowNew(false); setShowMenu(false); setShowEmoji(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...chats]
      .filter((c) =>
        !q || c.name.toLowerCase().includes(q) ||
        c.messages.some((m) => m.text?.toLowerCase().includes(q)))
      .sort((a, b) => lastTs(b) - lastTs(a))
  }, [chats, query])

  const update = (id, fn) =>
    setChats((prev) => prev.map((c) => (c.id === id ? fn(c) : c)))

  /* ----- actions ----- */
  const openChat = (id) => {
    setActiveId(id)
    setView('messages')
    setSearchOpen(false)
    setChatQuery('')
    setShowMenu(false)
    update(id, (c) => ({ ...c, unread: 0 }))
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms))

  const simulateReply = (chatId, msgId) => {
    const chat = chatsRef.current.find((c) => c.id === chatId)
    if (!chat?.online) return
    later(() => update(chatId, (c) => ({
      ...c, messages: c.messages.map((m) => (m.id === msgId ? { ...m, status: 'delivered' } : m)),
    })), 600)
    later(() => setTypingId(chatId), 1100)
    later(() => {
      setTypingId(null)
      const reply = { id: uid(), from: 'them', text: pick(REPLIES), ts: Date.now(), status: 'read' }
      const isOpen = activeRef.current === chatId && viewRef.current === 'messages'
      update(chatId, (c) => ({
        ...c,
        messages: [...c.messages.map((m) => (m.from === 'me' ? { ...m, status: 'read' } : m)), reply],
        unread: isOpen ? 0 : c.unread + 1,
      }))
    }, 2600)
  }

  const sendMessage = (extra = {}) => {
    const text = draft.trim()
    if (!active || (!text && !extra.file)) return
    const msg = { id: uid(), from: 'me', text, ts: Date.now(), status: 'sent', ...extra }
    update(active.id, (c) => ({ ...c, messages: [...c.messages, msg] }))
    setDraft('')
    setShowEmoji(false)
    simulateReply(active.id, msg.id)
  }

  const onSubmit = (e) => {
    e.preventDefault()
    sendMessage()
  }

  const onFile = (e) => {
    const f = e.target.files?.[0]
    if (f) sendMessage({ file: { name: f.name, size: f.size } })
    e.target.value = ''
  }

  const deleteMessage = (mid) =>
    update(active.id, (c) => ({ ...c, messages: c.messages.filter((m) => m.id !== mid) }))

  const clearChat = () => {
    update(active.id, (c) => ({ ...c, messages: [] }))
    setShowMenu(false)
  }

  const deleteConversation = () => {
    const rest = chats.filter((c) => c.id !== active.id)
    setChats(rest)
    setActiveId(rest[0]?.id ?? null)
    setShowMenu(false)
  }

  const createChat = (e) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    const chat = {
      id: uid(), name, color: COLORS[chats.length % COLORS.length],
      online: true, lastSeen: Date.now(), unread: 0, createdAt: Date.now(), messages: [],
    }
    setChats((prev) => [chat, ...prev])
    setNewName('')
    setShowNew(false)
    openChat(chat.id)
  }

  const resetAll = () => {
    const seed = makeSeed()
    setChats(seed)
    setActiveId(seed[0].id)
    setView('messages')
  }

  /* ----- derived for render ----- */
  const visibleMessages = active
    ? active.messages.filter((m) => !chatQuery || m.text?.toLowerCase().includes(chatQuery.toLowerCase()))
    : []
  const totalUnread = chats.reduce((n, c) => n + c.unread, 0)

  const statusLine = !active ? '' :
    typingId === active.id ? 'typing…' :
    active.online ? 'Online' : `Last seen ${lastSeenText(active.lastSeen)}`

  return (
    <div className="window">
      {splash && <Splash onDone={hideSplash} />}

      <div className="titlebar">
        <span className="lights"><i /><i /><i /></span>
        <span className="title"><Asterisk size={13} /> ChitChat</span>
      </div>

      <div className="shell">
        {/* sidebar */}
        <aside className="sidebar">
          <div className="brand"><Asterisk size={22} /></div>
          <nav>
            <button className={view === 'messages' ? 'nav active' : 'nav'} onClick={() => setView('messages')}>
              <MessageSquare size={18} /> Messages
              {totalUnread > 0 && <span className="pill">{totalUnread}</span>}
            </button>
            <button className={view === 'contacts' ? 'nav active' : 'nav'} onClick={() => setView('contacts')}>
              <Users size={18} /> Contacts
            </button>
            <button className={view === 'settings' ? 'nav active' : 'nav'} onClick={() => setView('settings')}>
              <Settings size={18} /> Settings
            </button>
          </nav>
          <div className="me-card">
            <div className="avatar av-blue" style={{ width: 38, height: 38, fontSize: 12 }}>
              {initials(myName) || 'Me'}<span className="dot" />
            </div>
            <div>
              <strong>{myName}</strong>
              <small>Online</small>
            </div>
          </div>
        </aside>

        {/* middle column */}
        <section className="list-col">
          {view === 'messages' && (
            <>
              <label className="search">
                <Search size={16} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search conversations…" />
                {query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button>}
              </label>
              <div className="list-head">
                <h2>Messages</h2>
                <button className="icon-btn primary" onClick={() => setShowNew(true)} aria-label="New chat">
                  <Plus size={18} />
                </button>
              </div>
              <div className="chat-list">
                {sorted.length === 0 && <p className="empty">No conversations found.</p>}
                {sorted.map((c) => (
                  <button key={c.id} className={c.id === activeId ? 'chat-item active' : 'chat-item'} onClick={() => openChat(c.id)}>
                    <Avatar chat={c} />
                    <div className="chat-info">
                      <div className="row">
                        <strong>{c.name}</strong>
                        <time>{lastTs(c) ? listTime(lastTs(c)) : ''}</time>
                      </div>
                      <div className="row">
                        <span className="preview">{previewOf(c)}</span>
                        {c.unread > 0 && <span className="badge">{c.unread}</span>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {view === 'contacts' && (
            <>
              <div className="list-head"><h2>Contacts</h2>
                <button className="icon-btn primary" onClick={() => setShowNew(true)} aria-label="Add contact"><Plus size={18} /></button>
              </div>
              <div className="chat-list">
                {[...chats].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
                  <button key={c.id} className="chat-item" onClick={() => openChat(c.id)}>
                    <Avatar chat={c} />
                    <div className="chat-info">
                      <strong>{c.name}</strong>
                      <span className="preview">{c.online ? 'Online' : `Last seen ${lastSeenText(c.lastSeen)}`}</span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {view === 'settings' && (
            <div className="settings">
              <div className="list-head"><h2>Settings</h2></div>
              <label className="field">
                Display name
                <input value={myName} onChange={(e) => setMyName(e.target.value)} maxLength={24} />
              </label>
              <div className="field">
                Appearance
                <div className="seg">
                  <button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')}>Light</button>
                  <button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')}>Dark</button>
                </div>
              </div>
              <button className="danger-btn" onClick={resetAll}><Trash2 size={15} /> Reset all chats</button>
            </div>
          )}
        </section>

        {/* chat pane */}
        <main className="chat-col">
          {!active ? (
            <div className="blank">
              <MessageSquare size={40} />
              <p>Select a conversation or start a new one.</p>
              <button className="btn" onClick={() => setShowNew(true)}>New chat</button>
            </div>
          ) : (
            <>
              <header className="chat-head">
                <Avatar chat={active} size={42} />
                <div className="who">
                  <strong>{active.name}</strong>
                  <span className={active.online || typingId === active.id ? 'online' : ''}>{statusLine}</span>
                </div>
                <div className="head-actions">
                  <button className="icon-btn" onClick={() => { setSearchOpen((s) => !s); setChatQuery('') }} aria-label="Search in chat">
                    <Search size={18} />
                  </button>
                  <div className="menu-wrap">
                    <button className="icon-btn" onClick={() => setShowMenu((s) => !s)} aria-label="More">
                      <MoreVertical size={18} />
                    </button>
                    {showMenu && (
                      <div className="menu">
                        <button onClick={clearChat}>Clear chat</button>
                        <button className="danger" onClick={deleteConversation}>Delete conversation</button>
                      </div>
                    )}
                  </div>
                </div>
              </header>

              {searchOpen && (
                <div className="chat-search">
                  <Search size={15} />
                  <input autoFocus value={chatQuery} onChange={(e) => setChatQuery(e.target.value)} placeholder="Search in this chat…" />
                  <button onClick={() => { setSearchOpen(false); setChatQuery('') }}><X size={15} /></button>
                </div>
              )}

              <div className="messages">
                <div className="secure"><Lock size={12} /> Messages are sent over a secure connection</div>
                {visibleMessages.length === 0 && (
                  <p className="empty">{chatQuery ? 'No matching messages.' : `No messages yet. Say hi to ${active.name.split(' ')[0]} 👋`}</p>
                )}
                {visibleMessages.map((m, i) => {
                  const prev = visibleMessages[i - 1]
                  const newDay = !prev || dayLabel(prev.ts) !== dayLabel(m.ts)
                  return (
                    <div key={m.id}>
                      {newDay && <div className="day"><span>{dayLabel(m.ts)}</span></div>}
                      <div className={m.from === 'me' ? 'msg me' : 'msg'}>
                        <div className="bubble">
                          {m.from === 'them' && <span className="sender">{active.name.split(' ')[0]}</span>}
                          {m.file && (
                            <div className="file">
                              <FileText size={18} />
                              <div><strong>{m.file.name}</strong><small>{fileSize(m.file.size)}</small></div>
                            </div>
                          )}
                          {m.text && <p>{m.text}</p>}
                          <div className="meta">
                            <time>{fmtTime(m.ts)}</time>
                            {m.from === 'me' && <Ticks status={m.status} />}
                          </div>
                          {m.from === 'me' && (
                            <button className="del" onClick={() => deleteMessage(m.id)} aria-label="Delete message">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {typingId === active.id && (
                  <div className="msg"><div className="bubble typing"><i /><i /><i /></div></div>
                )}
                <div ref={endRef} />
              </div>

              <form className="composer" onSubmit={onSubmit}>
                <input ref={fileRef} type="file" hidden onChange={onFile} />
                <button type="button" className="icon-btn" onClick={() => fileRef.current?.click()} aria-label="Attach file">
                  <Paperclip size={20} />
                </button>
                <div className="emoji-wrap">
                  <button type="button" className="icon-btn" onClick={() => setShowEmoji((s) => !s)} aria-label="Emoji">
                    <Smile size={20} />
                  </button>
                  {showEmoji && (
                    <div className="emoji-pop">
                      {EMOJIS.map((e) => (
                        <button type="button" key={e} onClick={() => { setDraft((d) => d + e); inputRef.current?.focus() }}>{e}</button>
                      ))}
                    </div>
                  )}
                </div>
                <input
                  ref={inputRef}
                  className="text-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type a message…"
                  autoComplete="off"
                />
                <button type="submit" className="send" disabled={!draft.trim()} aria-label="Send">
                  <Send size={18} />
                </button>
              </form>
            </>
          )}
        </main>
      </div>

      {showNew && (
        <div className="overlay" onMouseDown={() => setShowNew(false)}>
          <form className="modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={createChat}>
            <h3>New chat</h3>
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Contact name" maxLength={30} />
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setShowNew(false)}>Cancel</button>
              <button type="submit" className="btn" disabled={!newName.trim()}>Start chat</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}