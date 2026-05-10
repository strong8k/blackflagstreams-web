import React, { useState } from 'react';
import { useStore } from '../lib/store';
import TorBoxPromo from '../components/TorBoxPromo';
import { stremioLogin, stremioGetLibrary, processStremioLibrary } from '../lib/stremio';
import './SettingsPage.css';

export default function SettingsPage() {
  const settings = useStore(s => s.settings);
  const setTmdbKey = useStore(s => s.setTmdbKey);
  const setCorsProxy = useStore(s => s.setCorsProxy);
  const addToast = useStore(s => s.addToast);
  const bulkImport = useStore(s => s.bulkImport);

  const [stremioEmail, setStremioEmail] = useState('');
  const [stremioPass, setStremioPass] = useState('');
  const [importing, setImporting] = useState(false);

  const handleStremioImport = async () => {
    if (!stremioEmail || !stremioPass) {
      addToast('Please enter your Stremio credentials', 'warning');
      return;
    }
    setImporting(true);
    try {
      addToast('Logging into Stremio...', 'info');
      const { authKey } = await stremioLogin(stremioEmail, stremioPass);
      
      addToast('Fetching your library...', 'info');
      const library = await stremioGetLibrary(authKey);
      
      addToast(`Processing ${library.length} items...`, 'info');
      const data = await processStremioLibrary(library);
      
      await bulkImport(data);
      addToast(`Success! Imported ${data.watchlist.length} watchlist items and ${data.history.length} history items.`, 'success');
      setStremioEmail('');
      setStremioPass('');
    } catch (err) {
      addToast(err.message || 'Stremio import failed', 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="page settings-page">
      <div className="container" style={{ paddingTop: '2rem' }}>
        <h2 className="section-title">⚙ Settings</h2>
        
        <div className="settings-grid">
          {/* General Settings */}
          <section className="settings-section">
            <h3>General</h3>
            <div className="settings-group">
              <label>TMDB API Key</label>
              <input 
                type="text" 
                defaultValue={settings.userTmdbKey} 
                placeholder={settings.effectiveTmdbKey ? `Using Global: ${settings.effectiveTmdbKey.slice(0, 8)}...` : "Enter your TMDB API key"} 
                onBlur={e => setTmdbKey(e.target.value)} 
              />
              <p className="setting-desc">Required for fetching movie and series metadata. Leave blank to use the global key.</p>
            </div>
            <div className="settings-group">
              <label>CORS Proxy URL</label>
              <input 
                type="text" 
                defaultValue={settings.userCorsProxy} 
                placeholder={settings.effectiveCorsProxy ? `Using Global: ${settings.effectiveCorsProxy}` : "https://your-proxy.com/cors"} 
                onBlur={e => setCorsProxy(e.target.value)} 
              />
              <p className="setting-desc">Used to bypass CORS restrictions. Leave blank to use the global proxy.</p>
            </div>
            
            <div className="settings-group" style={{ marginTop: '2rem' }}>
              <label>Debrid Services</label>
              <TorBoxPromo />
            </div>
          </section>

          {/* Import / Export */}
          <section className="settings-section">
            <h3>Import Data</h3>
            <div className="settings-group stremio-import">
              <label>Import from Stremio</label>
              <p className="setting-desc">Connect your Stremio account to import your library and watch history.</p>
              <div className="stremio-form">
                <input 
                  type="email" 
                  placeholder="Stremio Email" 
                  value={stremioEmail}
                  onChange={e => setStremioEmail(e.target.value)}
                />
                <input 
                  type="password" 
                  placeholder="Stremio Password" 
                  value={stremioPass}
                  onChange={e => setStremioPass(e.target.value)}
                />
                <button 
                  className="btn btn-gold" 
                  onClick={handleStremioImport}
                  disabled={importing}
                >
                  {importing ? 'Importing...' : '🚢 Import Library'}
                </button>
              </div>
            </div>
          </section>

          {/* Maintenance */}
          <section className="settings-section">
            <h3>Maintenance</h3>
            <button className="btn btn-secondary" onClick={() => { localStorage.clear(); window.location.reload(); }}>
              🗑 Clear All Data & Logout
            </button>
          </section>
        </div>
      </div>

    </div>
  );
}
