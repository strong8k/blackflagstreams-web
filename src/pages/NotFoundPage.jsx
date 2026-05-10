import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
      <div className="empty-state">
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🏴‍☠️</div>
        <h3>Off the Map</h3>
        <p>This page doesn't exist, mate.</p>
        <button className="btn btn-primary" onClick={() => navigate('/')} style={{ marginTop: '1rem' }}>Sail Home</button>
      </div>
    </div>
  );
}
