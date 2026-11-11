import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  EllipsisVertical,
  FileText,
  Image as ImageIcon,
  Lock,
  MessageCircle,
  Moon,
  Paperclip,
  Search,
  SendHorizontal,
  Settings,
  Smile,
  SquarePen,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { useLocalStorage } from './useLocalStorage';
import Splash from './components/Splash';
import Avatar from './components/Avatar';
import ProfileModal from './components/ProfileModal';
import NewChatModal from './components/NewChatModal';
import {
  EMOJIS,
  escapeRegExp,
  formatBytes,
  formatClock,
  formatDayLabel,
  formatListTime,
  makeThumbnail,
  newId,
  pickReply,
  previewText,
  sameDay,
} from './utils';
import './App.css';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const seedNow = Date.now();

const DEFAULT_PROFILE = {
  name: 'You',
  about: "Hey there! I'm using ChitChat",
  avatarImage: null,
};

const SEED_CHATS = [
  { id: 1, name: 'Alex Smith', phone: '9811223344', unread: 2 },
  { id: 2, name: 'Design Team', phone: 'Group', unread: 0 },
  { id: 3, name: 'Sarah Jenkins', phone: '9988776655', unread: 0 },
];

const SEED_MESSAGES = {
  1: [
    { id: 101, sender: 'other', kind: 'text', text: 'Hey there! How is the new ChitChat theme coming along?', ts: seedNow - 25 * MIN },
    { id: 102, sender: 'me', kind: 'text', text: 'Looking amazing with the new intro animation!', ts: seedNow - 23 * MIN, status: 'read' },
    { id: 103, sender: 'other', kind: 'text', text: 'Nice! Are we still meeting today?', ts: seedNow - 10 * MIN },
  ],
  2: [{ id: 201, sender: 'other', kind: 'text', text: 'New wireframes are uploaded. Take a look!', ts: seedNow - DAY - 2 * HOUR }],
  3: [{ id: 301, sender: 'other', kind: 'text', text: 'Document received, thank you!', ts: seedNow - 3 * DAY }],
};

function systemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function Highlight({ text, query }) {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, 'ig'));
  return parts.map((part, index) =>
    part.toLowerCase() === query.toLowerCase() ? <mark key={index}>{part}</mark> : part,
  );
}

function StatusTicks({ status }) {
  if (status === 'sent') return <Check size={15} className="tick" />;
  if (status === 'delivered') return <CheckCheck size={15} className="tick" />;
  return <CheckCheck size={15} className="tick tick-read" />;
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const finishSplash = useCallback(() => setShowSplash(false), []);

  const [profile, setProfile] = useLocalStorage('chitchat_v2_profile', DEFAULT_PROFILE);
  const [chats, setChats] = useLocalStorage('chitchat_v2_chats', SEED_CHATS);
  const [conversations, setConversations] = useLocalStorage('chitchat_v2_messages', SEED_MESSAGES);
  const [theme, setTheme] = useLocalStorage('chitchat_v2_theme', systemTheme());

  const [activeChatId, setActiveChatId] = useState(() => SEED_CHATS[0]?.id ?? null);
  const [mobileView, setMobileView] = useState('list');
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [typing, setTyping] = useState({});

  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatQuery, setChatQuery] = useState('');
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const activeChatRef = useRef(activeChatId);
  const timers = useRef([]);
  const bottomRef = useRef(null);
  const imageInputRef = useRef(null);
  const docInputRef = useRef(null);
  const messageInputRef = useRef(null);

  useEffect(() => {
    activeChatRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // On wide screens the first chat is already on screen, so mark it read.
  useEffect(() => {
    if (window.innerWidth > 820) {
      setChats((prev) => prev.map((c) => (c.id === activeChatRef.current ? { ...c, unread: 0 } : c)));
    }
  }, [setChats]);

  // Messages restored from a previous visit are treated as already read.
  useEffect(() => {
    setConversations((prev) => {
      const next = {};
      for (const [id, list] of Object.entries(prev)) {
        next[id] = list.map((m) => (m.sender === 'me' && m.status !== 'read' ? { ...m, status: 'read' } : m));
      }
      return next;
    });
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, [setConversations]);

  // Close popovers when clicking outside of them, and on Escape.
  useEffect(() => {
    const closeAll = () => {
      setEmojiOpen(false);
      setAttachOpen(false);
      setMenuOpen(false);
    };
    const onPointer = (event) => {
      if (!event.target.closest('[data-popover]')) closeAll();
    };
    const onKey = (event) => {
      if (event.key === 'Escape') closeAll();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const later = useCallback((fn, ms) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
  }, []);

  const appendMessage = useCallback(
    (chatId, message) => {
      setConversations((prev) => ({ ...prev, [chatId]: [...(prev[chatId] || []), message] }));
    },
    [setConversations],
  );

  const setStatus = useCallback(
    (chatId, messageId, status) => {
      setConversations((prev) => ({
        ...prev,
        [chatId]: (prev[chatId] || []).map((m) => (m.id === messageId ? { ...m, status } : m)),
      }));
    },
    [setConversations],
  );

  // Fake delivery receipts, a typing indicator and an optional auto reply.
  const simulateDelivery = useCallback(
    (chatId, messageId, withReply) => {
      later(() => setStatus(chatId, messageId, 'delivered'), 600);
      later(() => setStatus(chatId, messageId, 'read'), 1500);
      if (!withReply) return;
      later(() => setTyping((prev) => ({ ...prev, [chatId]: true })), 1700);
      later(() => {
        setTyping((prev) => ({ ...prev, [chatId]: false }));
        appendMessage(chatId, {
          id: Date.now() + Math.random(),
          sender: 'other',
          kind: 'text',
          text: pickReply(),
          ts: Date.now(),
        });
        if (activeChatRef.current !== chatId) {
          setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, unread: (c.unread || 0) + 1 } : c)));
        }
      }, 3300 + Math.random() * 1200);
    },
    [appendMessage, later, setChats, setStatus],
  );

  const chatList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return chats
      .map((chat) => {
        const list = conversations[chat.id] || [];
        return { ...chat, last: list[list.length - 1] };
      })
      .filter((chat) => {
        if (filter === 'unread' && !chat.unread) return false;
        if (!q) return true;
        return (
          chat.name.toLowerCase().includes(q) ||
          chat.phone.includes(q) ||
          previewText(chat.last).toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.last?.ts || 0) - (a.last?.ts || 0));
  }, [chats, conversations, filter, searchQuery]);

  const unreadTotal = chats.reduce((sum, c) => sum + (c.unread || 0), 0);
  const activeChat = chats.find((c) => c.id === activeChatId) || null;
  const messages = useMemo(() => (activeChat ? conversations[activeChat.id] || [] : []), [activeChat, conversations]);
  const visibleMessages = useMemo(() => {
    const q = chatQuery.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => m.kind === 'text' && m.text.toLowerCase().includes(q));
  }, [messages, chatQuery]);
  const isTyping = activeChat ? Boolean(typing[activeChat.id]) : false;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [visibleMessages.length, isTyping, activeChatId]);

  const openChat = (id) => {
    setActiveChatId(id);
    setMobileView('chat');
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    setChatSearchOpen(false);
    setChatQuery('');
    setEmojiOpen(false);
    setAttachOpen(false);
    setMenuOpen(false);
    setTimeout(() => messageInputRef.current?.focus(), 0);
  };

  const handleSend = (event) => {
    event.preventDefault();
    const text = messageInput.trim();
    if (!text || !activeChat) return;
    const message = { id: Date.now(), sender: 'me', kind: 'text', text, ts: Date.now(), status: 'sent' };
    appendMessage(activeChat.id, message);
    simulateDelivery(activeChat.id, message.id, true);
    setMessageInput('');
    setEmojiOpen(false);
  };

  const handleImagePicked = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !activeChat) return;
    try {
      const thumb = await makeThumbnail(file);
      const message = {
        id: Date.now(),
        sender: 'me',
        kind: 'image',
        thumb,
        fileName: file.name,
        ts: Date.now(),
        status: 'sent',
      };
      appendMessage(activeChat.id, message);
      simulateDelivery(activeChat.id, message.id, false);
    } catch {
      // Unreadable image: nothing to send.
    }
  };

  const handleDocPicked = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !activeChat) return;
    const message = {
      id: Date.now(),
      sender: 'me',
      kind: 'file',
      fileName: file.name,
      size: file.size,
      ts: Date.now(),
      status: 'sent',
    };
    appendMessage(activeChat.id, message);
    simulateDelivery(activeChat.id, message.id, false);
  };

  const handleCreateChat = ({ name, phone }) => {
    const id = newId();
    setChats((prev) => [{ id, name, phone, unread: 0 }, ...prev]);
    setConversations((prev) => ({
      ...prev,
      [id]: [
        {
          id: id + 1,
          sender: 'system',
          kind: 'system',
          text: `Chat started with ${name} (+91 ${phone})`,
          ts: Date.now(),
        },
      ],
    }));
    setNewChatOpen(false);
    openChat(id);
  };

  const handleClearChat = () => {
    if (!activeChat) return;
    if (!window.confirm(`Clear all messages with ${activeChat.name}?`)) return;
    setConversations((prev) => ({ ...prev, [activeChat.id]: [] }));
    setMenuOpen(false);
  };

  const handleDeleteChat = () => {
    if (!activeChat) return;
    if (!window.confirm(`Delete your chat with ${activeChat.name}?`)) return;
    const id = activeChat.id;
    const remaining = chats.filter((c) => c.id !== id);
    setChats(remaining);
    setConversations((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setActiveChatId(remaining[0]?.id ?? null);
    setMobileView('list');
    setMenuOpen(false);
  };

  const toggleChatSearch = () => {
    setChatSearchOpen((open) => !open);
    setChatQuery('');
    setMenuOpen(false);
  };

  const renderMessages = () => {
    const nodes = [];
    visibleMessages.forEach((msg, index) => {
      const prev = visibleMessages[index - 1];
      if (!prev || !sameDay(prev.ts, msg.ts)) {
        nodes.push(
          <div key={`day-${msg.id}`} className="day-chip">
            <span>{formatDayLabel(msg.ts)}</span>
          </div>,
        );
      }
      if (msg.kind === 'system') {
        nodes.push(
          <div key={msg.id} className="system-chip">
            <span>{msg.text}</span>
          </div>,
        );
        return;
      }
      const mine = msg.sender === 'me';
      const startsGroup = !prev || prev.sender !== msg.sender || prev.kind === 'system' || !sameDay(prev.ts, msg.ts);
      nodes.push(
        <div key={msg.id} className={`message-row ${mine ? 'sent' : 'received'} ${startsGroup ? 'group-start' : ''}`}>
          <div className={`bubble ${msg.kind !== 'text' ? 'bubble-media' : ''}`}>
            {msg.kind === 'image' && (
              <img className="bubble-image" src={msg.thumb} alt={msg.fileName} draggable="false" />
            )}
            {msg.kind === 'file' && (
              <div className="bubble-file">
                <span className="bubble-file-icon">
                  <FileText size={20} />
                </span>
                <span className="bubble-file-meta">
                  <strong>{msg.fileName}</strong>
                  <small>{formatBytes(msg.size)}</small>
                </span>
              </div>
            )}
            {msg.kind === 'text' && (
              <p>
                <Highlight text={msg.text} query={chatQuery.trim()} />
              </p>
            )}
            <span className="bubble-meta">
              {formatClock(msg.ts)}
              {mine && <StatusTicks status={msg.status} />}
            </span>
          </div>
        </div>,
      );
    });
    return nodes;
  };

  return (
    <>
      {showSplash && <Splash onDone={finishSplash} />}

      <div className="ambient" aria-hidden="true">
        <span className="ambient-orb ambient-orb-a" />
        <span className="ambient-orb ambient-orb-b" />
      </div>

      <div className={`app-shell ${showSplash ? 'app-hidden' : 'app-visible'}`} data-view={mobileView}>
        {/* ---------- Sidebar ---------- */}
        <aside className="sidebar">
          <header className="sidebar-header">
            <button className="me-btn" onClick={() => setProfileOpen(true)} aria-label="Edit your profile">
              <Avatar name={profile.name} image={profile.avatarImage} size={44} online />
            </button>
            <div className="brand">
              <span className="brand-name">
                Chit<em>Chat</em>
              </span>
              <span className="brand-sub">{unreadTotal > 0 ? `${unreadTotal} unread` : 'All caught up'}</span>
            </div>
            <div className="header-actions">
              <button
                className="icon-btn"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                title="Toggle theme"
              >
                {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
              </button>
              <button className="icon-btn" onClick={() => setNewChatOpen(true)} aria-label="New chat" title="New chat">
                <SquarePen size={19} />
              </button>
              <button className="icon-btn" onClick={() => setProfileOpen(true)} aria-label="Profile settings" title="Profile">
                <Settings size={19} />
              </button>
            </div>
          </header>

          <div className="search-wrap">
            <Search size={17} />
            <input
              type="text"
              placeholder="Search chats or numbers"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search chats"
            />
            {searchQuery && (
              <button className="clear-btn" onClick={() => setSearchQuery('')} aria-label="Clear search">
                <X size={15} />
              </button>
            )}
          </div>

          <div className="filter-tabs" role="tablist">
            {['all', 'unread'].map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={filter === tab}
                className={`filter-tab ${filter === tab ? 'active' : ''}`}
                onClick={() => setFilter(tab)}
              >
                {tab === 'all' ? 'All' : 'Unread'}
                {tab === 'unread' && unreadTotal > 0 && <span className="tab-count">{unreadTotal}</span>}
              </button>
            ))}
          </div>

          <nav className="chat-list" aria-label="Chats">
            {chatList.length > 0 ? (
              chatList.map((chat) => (
                <button
                  key={chat.id}
                  className={`chat-item ${activeChatId === chat.id ? 'active' : ''}`}
                  onClick={() => openChat(chat.id)}
                >
                  <Avatar name={chat.name} size={50} />
                  <span className="chat-body">
                    <span className="chat-row">
                      <span className="chat-name">{chat.name}</span>
                      <span className={`chat-time ${chat.unread ? 'is-unread' : ''}`}>{formatListTime(chat.last?.ts)}</span>
                    </span>
                    <span className="chat-row">
                      <span className="chat-snippet">
                        {typing[chat.id] ? (
                          <span className="snippet-typing">typing…</span>
                        ) : (
                          <>
                            {chat.last?.sender === 'me' && <StatusTicks status={chat.last.status} />}
                            {previewText(chat.last)}
                          </>
                        )}
                      </span>
                      {chat.unread > 0 && <span className="unread-badge">{chat.unread}</span>}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <div className="empty-list">
                <MessageCircle size={34} />
                <p>{searchQuery || filter === 'unread' ? 'No chats match.' : 'No chats yet.'}</p>
                <button className="btn primary small" onClick={() => setNewChatOpen(true)}>
                  Start a chat
                </button>
              </div>
            )}
          </nav>
        </aside>

        {/* ---------- Chat pane ---------- */}
        <main className="chat-pane">
          {activeChat ? (
            <>
              <header className="chat-header">
                <button className="icon-btn back-btn" onClick={() => setMobileView('list')} aria-label="Back to chats">
                  <ArrowLeft size={20} />
                </button>
                <Avatar name={activeChat.name} size={44} online={!isTyping} />
                <div className="chat-title">
                  <h2>{activeChat.name}</h2>
                  <span className={`chat-status ${isTyping ? 'is-typing' : ''}`}>
                    {isTyping ? 'typing…' : activeChat.phone === 'Group' ? 'Group chat' : `+91 ${activeChat.phone}`}
                  </span>
                </div>
                <div className="header-actions" data-popover>
                  <button className="icon-btn" onClick={toggleChatSearch} aria-label="Search in chat" title="Search in chat">
                    <Search size={19} />
                  </button>
                  <div className="popover-anchor">
                    <button
                      className="icon-btn"
                      onClick={() => setMenuOpen((open) => !open)}
                      aria-label="Chat options"
                      aria-expanded={menuOpen}
                    >
                      <EllipsisVertical size={19} />
                    </button>
                    {menuOpen && (
                      <div className="popover menu-popover">
                        <button onClick={toggleChatSearch}>
                          <Search size={16} /> Search messages
                        </button>
                        <button onClick={handleClearChat}>
                          <X size={16} /> Clear chat
                        </button>
                        <button className="danger" onClick={handleDeleteChat}>
                          <Trash2 size={16} /> Delete chat
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </header>

              {chatSearchOpen && (
                <div className="chat-search-bar">
                  <Search size={16} />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search in this chat"
                    value={chatQuery}
                    onChange={(e) => setChatQuery(e.target.value)}
                  />
                  <span className="chat-search-count">{chatQuery.trim() ? `${visibleMessages.length} found` : ''}</span>
                  <button className="clear-btn" onClick={toggleChatSearch} aria-label="Close search">
                    <X size={16} />
                  </button>
                </div>
              )}

              <section className="messages" aria-live="polite">
                <div className="notice">
                  <Lock size={13} />
                  <span>Demo chat. Messages are stored only on this device.</span>
                </div>

                {renderMessages()}

                {chatQuery.trim() && visibleMessages.length === 0 && (
                  <div className="system-chip">
                    <span>No messages match “{chatQuery.trim()}”</span>
                  </div>
                )}

                {isTyping && (
                  <div className="message-row received group-start">
                    <div className="bubble typing-bubble" aria-label={`${activeChat.name} is typing`}>
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </section>

              <footer className="composer-wrap">
                <form className="composer" onSubmit={handleSend}>
                  <div className="popover-anchor" data-popover>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => {
                        setEmojiOpen((open) => !open);
                        setAttachOpen(false);
                      }}
                      aria-label="Emoji"
                      aria-expanded={emojiOpen}
                    >
                      <Smile size={21} />
                    </button>
                    {emojiOpen && (
                      <div className="popover emoji-popover">
                        {EMOJIS.map((emoji) => (
                          <button
                            type="button"
                            key={emoji}
                            onClick={() => {
                              setMessageInput((value) => value + emoji);
                              messageInputRef.current?.focus();
                            }}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="popover-anchor" data-popover>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => {
                        setAttachOpen((open) => !open);
                        setEmojiOpen(false);
                      }}
                      aria-label="Attach"
                      aria-expanded={attachOpen}
                    >
                      <Paperclip size={20} />
                    </button>
                    {attachOpen && (
                      <div className="popover menu-popover attach-popover">
                        <button
                          type="button"
                          onClick={() => {
                            setAttachOpen(false);
                            imageInputRef.current?.click();
                          }}
                        >
                          <ImageIcon size={16} /> Photo
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAttachOpen(false);
                            docInputRef.current?.click();
                          }}
                        >
                          <FileText size={16} /> Document
                        </button>
                      </div>
                    )}
                  </div>

                  <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={handleImagePicked} />
                  <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.xlsx,.pptx" hidden onChange={handleDocPicked} />

                  <input
                    ref={messageInputRef}
                    className="composer-input"
                    type="text"
                    placeholder="Type a message"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    aria-label="Message"
                  />

                  <button type="submit" className="send-btn" disabled={!messageInput.trim()} aria-label="Send message">
                    <SendHorizontal size={20} />
                  </button>
                </form>
              </footer>
            </>
          ) : (
            <div className="welcome">
              <div className="welcome-mark">
                <MessageCircle size={42} />
              </div>
              <h2>
                Chit<em>Chat</em>
              </h2>
              <p>Pick a conversation or start a new one.</p>
              <button className="btn primary" onClick={() => setNewChatOpen(true)}>
                <SquarePen size={17} /> New chat
              </button>
            </div>
          )}
        </main>
      </div>

      {newChatOpen && <NewChatModal onCreate={handleCreateChat} onClose={() => setNewChatOpen(false)} />}
      {profileOpen && (
        <ProfileModal profile={profile} onSave={setProfile} onClose={() => setProfileOpen(false)} />
      )}
    </>
  );
}
