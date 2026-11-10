import React, { useState } from 'react';
import './App.css';

export default function Auth({ onLogin }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }

    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(phone)) {
      setError('Please enter a valid 10-digit phone number.');
      return;
    }

    setError('');
    onLogin({ name, phone });
  };

  return (
    <div className="auth-screen-container animate-fade-in">
      <div className="auth-card-box animate-pop-in">
        <div className="auth-logo-badge">💬</div>
        <h2>Welcome to ChitChat</h2>
        <p>Enter your profile details and a 10-digit phone number to get started.</p>
        
        {error && <div className="auth-error-alert">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form-group">
          <div className="input-field-wrap">
            <label>Your Name</label>
            <input 
              type="text" 
              placeholder="e.g. Bedanta Bora" 
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="input-field-wrap">
            <label>10-Digit Mobile Number</label>
            <div className="phone-input-row">
              <span className="country-code">+91</span>
              <input 
                type="text" 
                maxLength="10" 
                placeholder="9876543210" 
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              />
            </div>
          </div>

          <button type="submit" className="auth-submit-btn">Verify & Continue</button>
        </form>
      </div>
    </div>
  );
}