import React, { useState, useEffect } from 'react';
import { useLocalStorage } from './useLocalStorage';
import Auth from './Auth';
import './App.css';

export default function App() {
  const [userAuth, setUserAuth] = useLocalStorage('chitchat_user_auth', null);
  const [isLaunching, setIsLaunching] = useState(true);

  const [activeChatId, setActiveChatId] = useState(1);
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // New Chat Modal State
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactAvatar, setNewContactAvatar] = useState(null);

  // Profile & Avatar State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [userProfile, setUserProfile] = useLocalStorage('chitchat_profile', {
    name: userAuth?.name || 'Bedanta Bora',
    avatarImage: null, // Stores uploaded image data URL
    initials: userAuth?.name ? userAuth.name.charAt(0).toUpperCase() : 'CB',
    about: 'Secured with ChitChat E2EE',
    phone: userAuth?.phone || ''
  });

  const [chats, setChats] = useState([
    { id: 1, name: 'Alex Smith', phone: '9811223344', avatarImage: null, initials: 'A', lastMessage: 'Hey, are we still meeting today?', time: '10:45 AM', unread: 2 },
    { id: 2, name: 'Design Team', phone: 'Group', avatarImage: null, initials: 'D', lastMessage: 'Check out the new wireframes.', time: 'Yesterday', unread: 0 },
    { id: 3, name: 'Sarah Jenkins', phone: '9988776655', avatarImage: null, initials: 'S', lastMessage: 'Document sent successfully!', time: 'Monday', unread: 0 },
  ]);

  const [conversations, setConversations] = useState({
    1: [
      { id: 101, sender: 'other', text: 'Hey there! How is the ChitChat sky blue theme coming along?', time: '10:30 AM' },
      { id: 102, sender: 'me', text: 'Looking amazing with the new icons and profile picture support!', time: '10:32 AM' },
    ],
    2: [{ id: 201, sender: 'other', text: 'New sky blue UI wireframes uploaded.', time: 'Yesterday' }],
    3: [{ id: 301, sender: 'other', text: 'Document received!', time: 'Monday' }]
  });

  useEffect(() => {
    if (userAuth) {
      const timer = setTimeout(() => setIsLaunching(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [userAuth]);

  if (!userAuth) {
    return <Auth onLogin={(authData) => setUserAuth(authData)} />;
  }

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!messageInput.trim()) return;

    const newMessage = {
      id: Date.now(),
      sender: 'me',
      text: messageInput,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setConversations(prev => ({
      ...prev,
      [activeChatId]: [...(prev[activeChatId] || []), newMessage]
    }));

    setChats(chats.map(c => c.id === activeChatId ? { ...c, lastMessage: messageInput, time: 'Just now' } : c));
    setMessageInput('');
  };

  const handleFileUpload = (acceptType) => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = acceptType;
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const fileMsg = {
          id: Date.now(),
          sender: 'me',
          text: `📎 [Secure Attachment: ${file.name}]`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setConversations(prev => ({
          ...prev,
          [activeChatId]: [...(prev[activeChatId] || []), fileMsg]
        }));
      }
    };
    fileInput.click();
  };

  // Profile Picture File Converter for User
  const handleUserAvatarUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUserProfile(prev => ({ ...prev, avatarImage: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Profile Picture File Converter for New Contact
  const handleNewContactAvatarUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewContactAvatar(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateNewChat = (e) => {
    e.preventDefault();
    if (!newContactName.trim() || newContactPhone.length !== 10) {
      alert('Please enter a valid name and a 10-digit phone number.');
      return;
    }

    const newId = Date.now();
    const initials = newContactName.charAt(0).toUpperCase();

    const newChatObj = {
      id: newId,
      name: newContactName,
      phone: newContactPhone,
      avatarImage: newContactAvatar,
      initials: initials,
      lastMessage: 'Encryption established. Say hello!',
      time: 'Just now',
      unread: 0
    };

    setChats([newChatObj, ...chats]);
    setConversations(prev => ({
      ...prev,
      [newId]: [
        { id: Date.now(), sender: 'other', text: `Secure chat started with ${newContactName} (+91 ${newContactPhone}).`, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
      ]
    }));

    setActiveChatId(newId);
    setNewContactName('');
    setNewContactPhone('');
    setNewContactAvatar(null);
    setIsNewChatOpen(false);
  };

  const filteredChats = chats.filter(chat => 
    chat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chat.phone.includes(searchQuery) ||
    chat.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeChatDetails = chats.find(c => c.id === activeChatId);
  const currentMessages = conversations[activeChatId] || [];

  if (isLaunching) {
    return (
      <div className="splash-screen-container">
        <div className="splash-card animate-pop-in">
          <div className="splash-logo">💬</div>
          <h1>ChitChat</h1>
          <p>Connecting {userAuth.name} (+91 {userAuth.phone})...</p>
          <div className="splash-loader">
            <div className="splash-progress"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="whatsapp-app-layout animate-fade-in">
      {/* Sidebar */}
      <div className="whatsapp-sidebar">
        <div className="sidebar-header">
          <div 
            className="user-avatar-container" 
            onClick={() => setIsEditingProfile(true)} 
            title="Edit Profile & Picture"
          >
            {userProfile.avatarImage ? (
              <img src={userProfile.avatarImage} alt="Profile" />
            ) : (
              userProfile.initials
            )}
          </div>
          <div className="sidebar-actions">
            <button onClick={() => setIsNewChatOpen(true)} title="Start New Chat">✏️</button>
            <button onClick={() => setIsEditingProfile(true)} title="Settings">⚙️</button>
          </div>
        </div>

        <div className="search-container">
          <div className="search-box">
            <span>🔍</span>
            <input 
              type="text" 
              placeholder="Search or start new chat" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="chat-list">
          {filteredChats.length > 0 ? (
            filteredChats.map(chat => (
              <div 
                key={chat.id} 
                className={`chat-item ${activeChatId === chat.id ? 'active' : ''}`}
                onClick={() => setActiveChatId(chat.id)}
              >
                <div className="user-avatar-container">
                  {chat.avatarImage ? (
                    <img src={chat.avatarImage} alt={chat.name} />
                  ) : (
                    chat.initials
                  )}
                </div>
                <div className="chat-details">
                  <div className="chat-top-row">
                    <span className="chat-name">{chat.name}</span>
                    <span className="chat-time">{chat.time}</span>
                  </div>
                  <div className="chat-bottom-row">
                    <p className="chat-snippet">{chat.lastMessage}</p>
                    {chat.unread > 0 && <span className="unread-badge">{chat.unread}</span>}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
              No chats found. Click ✏️ above to start a new chat.
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Window */}
      <div className="whatsapp-chat-window">
        <div className="chat-header">
          <div className="active-user">
            <div className="user-avatar-container">
              {activeChatDetails?.avatarImage ? (
                <img src={activeChatDetails.avatarImage} alt={activeChatDetails.name} />
              ) : (
                activeChatDetails?.initials || '?'
              )}
            </div>
            <div>
              <h3>{activeChatDetails?.name || 'Select a chat'}</h3>
              <span className="status">{activeChatDetails?.phone ? `📱 +91 ${activeChatDetails.phone}` : 'online'}</span>
            </div>
          </div>
          <div className="chat-header-tools">
            <button title="Search in chat">🔍</button>
            <button title="Options / Logout" onClick={() => {
              if (window.confirm('Log out of ChitChat?')) {
                setUserAuth(null);
              }
            }}>⋮</button>
          </div>
        </div>

        <div className="messages-container">
          <div className="e2ee-notice">
            🔒 Messages are end-to-end encrypted with your 10-digit verification key.
          </div>
          {currentMessages.map(msg => (
            <div key={msg.id} className={`message-row ${msg.sender === 'me' ? 'sent' : 'received'}`}>
              <div className="message-bubble">
                <p>{msg.text}</p>
                <span className="message-time">{msg.time}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="chat-footer">
          <div className="attachment-btns">
            <button title="Attach Photo or Video" onClick={() => handleFileUpload('image/*,video/*')}>📷</button>
            <button title="Attach Document" onClick={() => handleFileUpload('.pdf,.docx,.txt')}>📎</button>
          </div>

          <form onSubmit={handleSendMessage} className="message-form">
            <input 
              type="text" 
              placeholder="Type a secure message..." 
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
            />
            <button type="submit" className="send-btn" title="Send Message">➤</button>
          </form>
        </div>
      </div>

      {/* New Chat Modal with Picture Upload */}
      {isNewChatOpen && (
        <div className="modal-backdrop">
          <div className="modal-card animate-pop-in">
            <h3>Start New Secure Chat</h3>
            <form onSubmit={handleCreateNewChat}>
              <div className="profile-upload-section">
                <div className="preview-avatar">
                  {newContactAvatar ? (
                    <img src={newContactAvatar} alt="Preview" />
                  ) : (
                    <span>📷</span>
                  )}
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Contact Picture</label>
                  <input 
                    type="file" 
                    accept="image/*" 
                    id="contact-file-input" 
                    style={{ display: 'none' }}
                    onChange={handleNewContactAvatarUpload}
                  />
                  <button 
                    type="button" 
                    className="upload-file-btn" 
                    onClick={() => document.getElementById('contact-file-input').click()}
                  >
                    Upload Avatar
                  </button>
                </div>
              </div>

              <div className="field">
                <label>Contact Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Rahul Sharma" 
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label>10-Digit Phone Number</label>
                <input 
                  type="text" 
                  maxLength="10" 
                  placeholder="9876543210" 
                  value={newContactPhone}
                  onChange={(e) => setNewContactPhone(e.target.value.replace(/\D/g, ''))}
                  required
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="save-btn" style={{ backgroundColor: '#334155' }} onClick={() => setIsNewChatOpen(false)}>Cancel</button>
                <button type="submit" className="save-btn">Start Chat</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Profile Settings Modal with Picture Upload */}
      {isEditingProfile && (
        <div className="modal-backdrop">
          <div className="modal-card animate-pop-in">
            <h3>Profile & Avatar Settings</h3>
            
            <div className="profile-upload-section">
              <div className="preview-avatar">
                {userProfile.avatarImage ? (
                  <img src={userProfile.avatarImage} alt="User Profile" />
                ) : (
                  userProfile.initials
                )}
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Profile Picture</label>
                <input 
                  type="file" 
                  accept="image/*" 
                  id="user-file-input" 
                  style={{ display: 'none' }}
                  onChange={handleUserAvatarUpload}
                />
                <button 
                  type="button" 
                  className="upload-file-btn" 
                  onClick={() => document.getElementById('user-file-input').click()}
                >
                  Change Photo
                </button>
              </div>
            </div>

            <div className="field">
              <label>Display Name</label>
              <input 
                type="text" 
                value={userProfile.name} 
                onChange={(e) => setUserProfile({...userProfile, name: e.target.value})}
              />
            </div>

            <div className="field">
              <label>Verified Mobile Number</label>
              <input 
                type="text" 
                value={`+91 ${userAuth.phone}`} 
                disabled 
                style={{ opacity: 0.6, cursor: 'not-allowed' }}
              />
            </div>

            <div className="field">
              <label>About Status</label>
              <input 
                type="text" 
                value={userProfile.about} 
                onChange={(e) => setUserProfile({...userProfile, about: e.target.value})}
              />
            </div>

            <div className="modal-actions">
              <button className="save-btn" onClick={() => setIsEditingProfile(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}