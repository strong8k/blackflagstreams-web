import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { submitBetaApplication } from '../lib/auth';
import './BetaTesterPage.css';

export default function BetaTesterPage() {
  const navigate = useNavigate();
  const addToast = useStore(s => s.addToast);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    techLevel: 'medium',
    experience: 'average',
    devices: [],
    motivation: '',
    commitment: false
  });

  const handleDeviceToggle = (device) => {
    setFormData(prev => ({
      ...prev,
      devices: prev.devices.includes(device)
        ? prev.devices.filter(d => d !== device)
        : [...prev.devices, device]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.commitment) {
      addToast('You must agree to provide feedback', 'warning');
      return;
    }
    setBusy(true);
    try {
      await submitBetaApplication(formData);
      setSuccess(true);
      addToast('Application submitted! Check your inbox.', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to submit application', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (success) {
    return (
      <div className="beta-page page">
        <motion.div 
          className="beta-card success glass-panel"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="beta-success-icon">⚓</div>
          <h1>Application Received!</h1>
          <p>
            Thank you for applying to the BlackFlagStreams BETA program. 
            We review applications manually to ensure a balanced crew of both tech experts and casual viewers.
          </p>
          <p>Keep a weather eye on your inbox for a message from the Captain.</p>
          <button className="btn btn-gold" onClick={() => navigate('/')}>Return to Port</button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="beta-page page">
      <motion.div 
        className="beta-card glass-panel"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="beta-header">
          <div className="beta-badge">BETA PROGRAM</div>
          <h1 className="section-title">Join the Crew</h1>
          <p className="beta-intro">
            We are looking for dedicated sailors to help us test the latest features, 
            break the system, and provide honest feedback.
          </p>
        </div>

        <div className="beta-requirements">
          <h3>Requirements for Service</h3>
          <ul>
            <li>Active participation in testing new features.</li>
            <li>Commitment to completing regular feedback surveys.</li>
            <li>Patience with bugs and "work-in-progress" experimental builds.</li>
          </ul>
        </div>

        <form onSubmit={handleSubmit} className="beta-form">
          <div className="form-group">
            <label>Captain's Name</label>
            <input 
              type="text" 
              required 
              placeholder="What do we call you?"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>

          <div className="form-group">
            <label>Email Address</label>
            <input 
              type="email" 
              required 
              placeholder="Where can we send orders?"
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
            />
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Technical Expertise</label>
              <select 
                value={formData.techLevel}
                onChange={e => setFormData({...formData, techLevel: e.target.value})}
              >
                <option value="low">Landlubber (Low)</option>
                <option value="medium">Deckhand (Medium)</option>
                <option value="high">Navigator (High)</option>
                <option value="expert">Engineer (Expert)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Streaming Knowledge</label>
              <select 
                value={formData.experience}
                onChange={e => setFormData({...formData, experience: e.target.value})}
              >
                <option value="none">None</option>
                <option value="average">Average</option>
                <option value="heavy">Power User</option>
                <option value="provider">Expert</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Primary Devices</label>
            <div className="device-chips">
              {['Web Browser', 'Android Phone', 'Android TV', 'Firestick', 'Desktop App'].map(d => (
                <button 
                  key={d}
                  type="button"
                  className={`device-chip ${formData.devices.includes(d) ? 'active' : ''}`}
                  onClick={() => handleDeviceToggle(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Why join the BETA?</label>
            <textarea 
              required
              rows={3}
              placeholder="Tell us what you bring to the crew..."
              value={formData.motivation}
              onChange={e => setFormData({...formData, motivation: e.target.value})}
            />
          </div>

          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input 
                type="checkbox" 
                required
                checked={formData.commitment}
                onChange={e => setFormData({...formData, commitment: e.target.checked})}
              />
              <span>I understand that BETA testers MUST provide feedback to remain in the program.</span>
            </label>
          </div>

          <div className="beta-actions">
            <button type="submit" className="btn btn-gold" disabled={busy}>
              {busy ? 'Sending Application...' : 'Submit Application'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
              Maybe Later
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
