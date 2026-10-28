import { useEffect, useState } from 'react'
import './App.css'

const contacts = [
  { id: 1, name: 'Alex Morgan', message: 'See you soon!', color: '#d8c5ff', time: '10:42' },
  { id: 2, name: 'Priya Sharma', message: 'That sounds great 😊', color: '#ffd8b4', time: '09:18' },
  { id: 3, name: 'Jordan Lee', message: 'Sent you the photos', color: '#b9e8d0', time: 'Yesterday' },
  { id: 4, name: 'Sam Wilson', message: 'Thanks!', color: '#ffcfda', time: 'Yesterday' },
]

const initialMessages = [
  { id: 1, sender: 'them', text: 'Hey! How are you doing?' },
  { id: 2, sender: 'me', text: 'Doing great! Working on my new chat app.' },
  { id: 3, sender: 'them', text: 'That sounds exciting! 😄' },
  { id: 4, sender: 'me', text: 'Yes! It will have end-to-end encryption 🔒' },
]

export default function App() {
  const [showSplash, setShowSplash] = useState(true)
  const [active, setActive] = useState(contacts[0])
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [conversations, setConversations] = useState({
    1: initialMessages,
    2: [{ id: 5, sender: 'them', text: 'That sounds great 😊' }],
    3: [{ id: 6, sender: 'them', text: 'Sent you the photos' }],
    4: [{ id: 7, sender: 'them', text: 'Thanks!' }],
  })

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2400)
    return () => clearTimeout(timer)
  }, [])

  const messages = conversations[active.id] || []

  const filteredContacts = contacts.filter((contact) =>
    contact.name.toLowerCase().includes(search.toLowerCase()),
  )

  function selectContact(contact) {
    setActive(contact)
    setText('')
  }

  function sendMessage(event) {
    event.preventDefault()
    const messageText = text.trim()

    if (!messageText) return

    const newMessage = {
      id: Date.now(),
      sender: 'me',
      text: messageText,
    }

    setConversations((previous) => ({
      ...previous,
      [active.id]: [...(previous[active.id] || []), newMessage],
    }))

    setText('')
  }

  if (showSplash) {
    return (
      <main className="splash-screen">
        <div className="splash-orb orb-one" />
        <div className="splash-orb orb-two" />

        <div className="splash-content">
          <div className="splash-logo">
            <span>✳</span>
          </div>

          <h1 className="splash-title">ChitChat</h1>

          <p className="splash-tagline">
            Your conversations. Your privacy.
          </p>

          <div className="splash-loader" aria-label="Loading">
            <span />
            <span />
            <span />
          </div>
        </div>

        <div className="splash-footer">CONNECT PRIVATELY</div>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">✳</span>
          <span>ChitChat</span>
        </div>

        <div className="profile">
          <div className="avatar my-avatar">Y</div>
          <div className="profile-info">
            <strong>Your account</strong>
            <small>Ready to connect</small>
          </div>
          <span className="online-dot" />
        </div>

        <div className="section-label">
          <span>MESSAGES</span>
          <span className="new-chat">＋</span>
        </div>

        <label className="search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
          />
        </label>

        <div className="contact-list">
          {filteredContacts.map((contact) => (
            <button
              className={`contact ${active.id === contact.id ? 'selected' : ''}`}
              key={contact.id}
              onClick={() => selectContact(contact)}
            >
              <div
                className="avatar"
                style={{ background: contact.color }}
              >
                {contact.name.split(' ').map((part) => part[0]).join('')}
              </div>

              <div className="contact-info">
                <strong>{contact.name}</strong>
                <small>
                  {conversations[contact.id]?.at(-1)?.text || contact.message}
                </small>
              </div>

              <small className="contact-time">{contact.time}</small>
            </button>
          ))}

          {filteredContacts.length === 0 && (
            <p className="empty-search">No conversations found.</p>
          )}
        </div>

        <div className="sidebar-footer">
          <span>🔒</span> Private by design
        </div>
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          <div
            className="avatar"
            style={{ background: active.color }}
          >
            {active.name.split(' ').map((part) => part[0]).join('')}
          </div>

          <div className="header-info">
            <strong>{active.name}</strong>
            <small>
              <span className="online-dot" />
              Demo conversation
            </small>
          </div>

          <div className="header-actions">
            <button type="button" title="Search conversations">⌕</button>
            <button type="button" title="More options">•••</button>
          </div>
        </header>

        <div className="encryption-note">
          <span>🔒</span>
          <div>
            <strong>ChitChat preview</strong>
            <small>
              Local demo only. Messages are not encrypted or sent to other users.
            </small>
          </div>
        </div>

        <div className="messages" key={active.id}>
          <div className="day-divider">
            <span>TODAY</span>
          </div>

          {messages.map((message) => (
            <div
              className={`message-row ${message.sender}`}
              key={message.id}
            >
              <div className="bubble">
                {message.text}
                {message.sender === 'me' && (
                  <small className="message-status">✓✓</small>
                )}
              </div>
            </div>
          ))}

          {messages.length === 0 && (
            <div className="empty-chat">
              <div className="empty-chat-icon">✳</div>
              <strong>Start a conversation</strong>
              <p>Send a message to say hello.</p>
            </div>
          )}
        </div>

        <form className="message-form" onSubmit={sendMessage}>
          <button
            type="button"
            className="attach"
            title="Attachments are coming soon"
            onClick={() => window.alert('Attachments are coming soon!')}
          >
            ＋
          </button>

          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={`Message ${active.name}...`}
            aria-label="Message"
          />

          <button
            className="send-button"
            type="submit"
            aria-label="Send message"
          >
            ➤
          </button>
        </form>

        <div className="bottom-caption">
          ChitChat · A little more private
        </div>
      </section>
    </main>
  )
}