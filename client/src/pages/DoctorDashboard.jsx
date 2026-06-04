import React, { useEffect, useState, useRef } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import axios from 'axios';

const API_BASE   = process.env.REACT_APP_API_URL    || 'http://localhost:3000';
const AUTH_TOKEN = process.env.REACT_APP_DOCTOR_TOKEN || '';

const fmtDate = s => {
  try { return new Date(s + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return s; }
};
const fmtDateLong = s => {
  try { return new Date(s + 'T00:00:00').toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return s; }
};
const fmtTs = ts => {
  if (!ts) return '—';
  try {
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })
      + ' ' + d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
};

const statusMap = {
  pending_approval: { label: 'Pending',   bg: '#fffbeb', color: '#d97706', border: '#fcd34d' },
  confirmed:        { label: 'Confirmed', bg: '#f0fdf4', color: '#16a34a', border: '#86efac' },
  rejected:         { label: 'Rejected',  bg: '#fef2f2', color: '#dc2626', border: '#fca5a5' },
};

const StatusBadge = ({ status }) => {
  const s = statusMap[status] || { label: status, bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' };
  return <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{s.label}</span>;
};

const SourceBadge = ({ source }) => (
  source === 'website'
    ? <span style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>Web</span>
    : <span style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>WA</span>
);

const Avatar = ({ name, size = 34 }) => {
  const initials = (name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const hue = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: `hsl(${hue},40%,55%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: size * 0.35, flexShrink: 0 }}>
      {initials}
    </div>
  );
};

const AptCard = ({ apt, actionLoading, actionError, onApprove, onReject, onOpen }) => (
  <div
    onClick={onOpen}
    style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: '12px 14px', borderLeft: `3px solid ${apt.status === 'confirmed' ? '#16a34a' : apt.status === 'rejected' ? '#dc2626' : '#d97706'}`, cursor: 'pointer' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <Avatar name={apt.patient_name} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{apt.patient_name || 'Unknown'}</div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>{apt.phone}</div>
      </div>
      <StatusBadge status={apt.status} />
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: '#475569' }}>{fmtDate(apt.date)}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#ea580c' }}>{apt.time}</span>
      <span style={{ fontSize: 11, color: '#64748b' }}>{apt.payment_method === 'medical_aid' ? apt.medical_aid || 'Medical Aid' : 'Cash'}</span>
      <SourceBadge source={apt.source} />
    </div>
    {apt.status === 'pending_approval' && (
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }} onClick={e => e.stopPropagation()}>
        <button type="button" disabled={actionLoading} onClick={onApprove}
          style={{ flex: 1, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 0', fontSize: 13, fontWeight: 600, cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? .5 : 1 }}>
          {actionLoading ? '…' : 'Approve'}
        </button>
        <button type="button" disabled={actionLoading} onClick={onReject}
          style={{ flex: 1, background: '#fff', color: '#dc2626', border: '1px solid #dc2626', borderRadius: 6, padding: '8px 0', fontSize: 13, fontWeight: 600, cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? .5 : 1 }}>
          {actionLoading ? '…' : 'Reject'}
        </button>
      </div>
    )}
    {actionError && <p style={{ color: '#dc2626', fontSize: 11, marginTop: 6 }}>{actionError}</p>}
  </div>
);

export default function DoctorDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [tab, setTab]                   = useState('calendar');
  const [selectedDay, setSelectedDay]   = useState(new Date().toISOString().split('T')[0]);
  const [month, setMonth]               = useState(new Date());
  const [search, setSearch]             = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [actionLoading, setActionLoading] = useState({});
  const [actionError, setActionError]     = useState({});
  const [autoPilot, setAutoPilot]         = useState(() => localStorage.getItem('autopilot') === 'true');
  const autoProcessedRef                  = useRef(new Set());
  const [sheetOpen, setSheetOpen]         = useState(false);
  const [detailApt, setDetailApt]         = useState(null);
  const [now, setNow]                     = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { localStorage.setItem('autopilot', autoPilot); }, [autoPilot]);

  useEffect(() => {
    if (!autoPilot || appointments.length === 0) return;
    const pend = appointments.filter(a => a.status === 'pending_approval');
    pend.forEach((apt, idx) => {
      if (autoProcessedRef.current.has(apt.id)) return;
      autoProcessedRef.current.add(apt.id);
      setTimeout(() => {
        const conflict = appointments.some(a => a.id !== apt.id && a.date === apt.date && a.time === apt.time && a.status === 'confirmed');
        handleAction(apt.id, !conflict);
      }, idx * 800);
    });
  }, [appointments, autoPilot]);

  useEffect(() => {
    if (!AUTH_TOKEN) { setError('REACT_APP_DOCTOR_TOKEN not configured'); setLoading(false); return; }
    const q = query(collection(db, 'appointments'), orderBy('created_at', 'desc'));
    const unsub = onSnapshot(q,
      snap => { setAppointments(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); },
      ()   => { setError('Failed to load appointments'); setLoading(false); }
    );
    return () => unsub();
  }, []);

  const handleAction = async (id, confirm) => {
    setActionLoading(s => ({ ...s, [id]: true }));
    setActionError(s => ({ ...s, [id]: null }));
    try {
      await axios.post(`${API_BASE}/confirm-appointment`,
        { appointmentId: id, confirm, doctorName: 'Dr. SG Majeke' },
        { headers: { Authorization: `Bearer ${AUTH_TOKEN}`, 'Content-Type': 'application/json' } }
      );
    } catch (e) {
      setActionError(s => ({ ...s, [id]: e.response?.data?.error || e.message }));
    } finally {
      setActionLoading(s => ({ ...s, [id]: false }));
    }
  };

  const today   = now.toISOString().split('T')[0];
  const pending = appointments.filter(a => a.status === 'pending_approval');
  const forDay  = d => appointments.filter(a => a.date === d).sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const filtered = appointments
    .filter(a => filterStatus === 'all' || a.status === filterStatus)
    .filter(a => !search || (a.patient_name || '').toLowerCase().includes(search.toLowerCase()) || (a.phone || '').includes(search));

  const buildCal = () => {
    const yr = month.getFullYear(), mo = month.getMonth();
    const first = new Date(yr, mo, 1).getDay(), days = new Date(yr, mo + 1, 0).getDate();
    const weeks = []; let d = 1 - first;
    for (let w = 0; w < 6; w++) {
      const wk = [];
      for (let i = 0; i < 7; i++, d++) {
        if (d < 1 || d > days) { wk.push(null); continue; }
        const ds = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        wk.push({ day: d, ds });
      }
      weeks.push(wk);
      if (d > days) break;
    }
    return weeks;
  };

  const weeks    = buildCal();
  const monthStr = month.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
  const dayApts  = forDay(selectedDay);

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; -webkit-text-size-adjust: 100%; }
    body { background: #f8fafc; font-family: 'Inter', system-ui, sans-serif; color: #334155; }

    .dash { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

    /* Topbar */
    .topbar {
      background: #fff; border-bottom: 1px solid #e2e8f0;
      padding: 0 24px; height: 56px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
    }
    .topbar-brand { display: flex; align-items: center; gap: 10px; }
    .topbar-actions { display: flex; align-items: center; gap: 8px; }

    /* Desktop nav */
    .desktop-nav { display: flex; gap: 2px; }
    .nav-btn { background: none; border: none; padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 500; color: #64748b; cursor: pointer; transition: background .15s, color .15s; white-space: nowrap; }
    .nav-btn:hover  { background: #f1f5f9; color: #0f172a; }
    .nav-btn.active { background: #fff7ed; color: #ea580c; font-weight: 600; }

    /* Body */
    .body { display: flex; flex: 1; overflow: hidden; }
    .main { flex: 1; overflow-y: auto; padding: 20px 24px; -webkit-overflow-scrolling: touch; }
    .sidebar { width: 280px; min-width: 280px; flex-shrink: 0; border-left: 1px solid #e2e8f0; background: #fff; overflow-y: auto; padding: 20px; }

    /* Calendar */
    .cal-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .cal-grid { display: grid; grid-template-columns: repeat(7,1fr); gap: 2px; }
    .cal-head { font-size: 10px; font-weight: 700; color: #94a3b8; text-align: center; padding: 5px 0; text-transform: uppercase; }
    .cal-cell { border-radius: 6px; min-height: 64px; padding: 5px; cursor: pointer; border: 1px solid transparent; transition: border-color .1s, background .1s; }
    .cal-cell:hover    { border-color: #e2e8f0; background: #f8fafc; }
    .cal-cell.today    { background: #fff7ed; border-color: #fdba74; }
    .cal-cell.selected { background: #fff7ed; border-color: #ea580c; }
    .cal-num { font-size: 12px; font-weight: 500; color: #475569; margin-bottom: 3px; }
    .cal-cell.today .cal-num    { color: #ea580c; font-weight: 700; }
    .cal-cell.selected .cal-num { color: #ea580c; font-weight: 700; }
    .cal-dots { display: flex; flex-wrap: wrap; gap: 2px; }
    .dot { width: 5px; height: 5px; border-radius: 50%; }

    /* Card list */
    .card-list { display: flex; flex-direction: column; gap: 10px; }

    /* Pending grid */
    .pending-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }

    /* Filters */
    .filter-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 14px; }
    .search-input { flex: 1; min-width: 140px; max-width: 260px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 12px; font-size: 13px; color: #334155; }
    .search-input:focus { outline: 2px solid #ea580c; outline-offset: 1px; }
    .pill-row { display: flex; gap: 5px; flex-wrap: wrap; }
    .pill { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 20px; padding: 4px 12px; font-size: 12px; font-weight: 500; color: #64748b; cursor: pointer; white-space: nowrap; }
    .pill.on { background: #ea580c; border-color: #ea580c; color: #fff; font-weight: 600; }

    /* Badges */
    .badge-pending { background: #fffbeb; color: #d97706; border: 1px solid #fcd34d; border-radius: 20px; padding: 2px 9px; font-size: 11px; font-weight: 700; }
    .ap-btn { display: flex; align-items: center; gap: 5px; border: none; border-radius: 6px; padding: 5px 10px; font-size: 12px; font-weight: 600; cursor: pointer; }
    .ap-btn.on  { background: #16a34a; color: #fff; }
    .ap-btn.off { background: #f1f5f9; color: #64748b; }
    .ap-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
    .ap-btn.on  .ap-dot { background: #fff; animation: pulse 1.4s infinite; }
    .ap-btn.off .ap-dot { background: #94a3b8; }

    /* Desktop table */
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 540px; }
    th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: .4px; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
    td { padding: 11px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    tr:hover td { background: #f8fafc; }
    tr:last-child td { border-bottom: none; }

    /* Bottom sheet overlay */
    .sheet-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 100; }
    .sheet-overlay.open { display: block; }
    .sheet { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-radius: 16px 16px 0 0; z-index: 101; max-height: 75vh; display: flex; flex-direction: column; transform: translateY(100%); transition: transform .28s cubic-bezier(.4,0,.2,1); }
    .sheet.open { transform: translateY(0); }
    .sheet-handle { width: 36px; height: 4px; background: #e2e8f0; border-radius: 2px; margin: 12px auto 0; flex-shrink: 0; }
    .sheet-header { padding: 14px 18px 10px; border-bottom: 1px solid #f1f5f9; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; }
    .sheet-body { overflow-y: auto; padding: 14px 18px 24px; flex: 1; -webkit-overflow-scrolling: touch; }

    /* Bottom nav — mobile only */
    .bottom-nav { display: none; }

    /* Spinners etc */
    @keyframes spin   { to { transform: rotate(360deg); } }
    @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:.3} }
    .spinner { width: 28px; height: 28px; border: 3px solid #e2e8f0; border-top-color: #ea580c; border-radius: 50%; animation: spin 1s linear infinite; }

    /* Mobile (≤ 768px) */
    @media (max-width: 768px) {
      .topbar { padding: 0 16px; height: 52px; }
      .desktop-nav { display: none; }
      .sidebar { display: none; }
      .main { padding: 12px 14px 72px; }
      .cal-cell { min-height: 46px; padding: 4px; }
      .cal-num { font-size: 11px; }
      .pending-grid { grid-template-columns: 1fr; }
      .ap-label { display: none; }
      #mobile-bookings { display: flex !important; }
      .desktop-table { display: none; }

      .bottom-nav {
        display: flex;
        position: fixed; bottom: 0; left: 0; right: 0;
        background: #fff; border-top: 1px solid #e2e8f0;
        height: 58px; z-index: 50;
      }
      .bnav-btn {
        flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 3px; background: none; border: none; cursor: pointer;
        font-size: 10px; font-weight: 500; color: #94a3b8; padding: 0;
        transition: color .15s;
      }
      .bnav-btn.active { color: #ea580c; }
      .bnav-icon { font-size: 19px; line-height: 1; }
    }

    @media (max-width: 380px) {
      .topbar-brand span { display: none; }
      .cal-head { font-size: 9px; }
    }
  `;

  if (loading) return (
    <>
      <style>{css}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    </>
  );

  if (error) return (
    <>
      <style>{css}</style>
      <div style={{ padding: 24, color: '#dc2626', fontSize: 14 }}>{error}</div>
    </>
  );

  const tabConfig = [
    { key: 'calendar', label: 'Calendar', icon: '📅' },
    { key: 'bookings', label: 'Bookings', icon: '📋' },
    { key: 'pending',  label: `Pending${pending.length ? ` (${pending.length})` : ''}`, icon: '⏳', mobileLabel: 'Pending' },
  ];

  return (
    <>
      <style>{css}</style>
      <div className="dash">

        {/* ── Topbar ── */}
        <header className="topbar">
          <div className="topbar-brand">
            <img src={`${process.env.PUBLIC_URL}/logo.png`} alt="logo"
              style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>Dr. SG Majeke</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>General Practitioner</div>
            </div>
          </div>

          <nav className="desktop-nav">
            {tabConfig.map(t => (
              <button key={t.key} className={`nav-btn${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </nav>

          <div className="topbar-actions">
            <button type="button" className={`ap-btn ${autoPilot ? 'on' : 'off'}`}
              onClick={() => { if (!autoPilot) autoProcessedRef.current.clear(); setAutoPilot(p => !p); }}
              title={autoPilot ? 'Auto Pilot ON' : 'Enable Auto Pilot'}>
              <span className="ap-dot" />
              <span className="ap-label">Auto {autoPilot ? 'ON' : 'OFF'}</span>
            </button>
            {pending.length > 0 && <span className="badge-pending">{pending.length}</span>}
          </div>
        </header>

        {/* ── Body ── */}
        <div className="body">
          <main className="main">

            {/* ── Calendar tab ── */}
            {tab === 'calendar' && (
              <>
                <div className="cal-nav">
                  <button type="button" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1))}
                    style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 13, color: '#334155' }}>‹</button>
                  <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{monthStr}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={() => { setMonth(new Date()); setSelectedDay(today); }}
                      style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer', color: '#64748b' }}>Today</button>
                    <button type="button" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1))}
                      style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 13, color: '#334155' }}>›</button>
                  </div>
                </div>

                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '12px 10px' }}>
                  <div className="cal-grid" style={{ marginBottom: 3 }}>
                    {['S','M','T','W','T','F','S'].map((d, i) => <div key={i} className="cal-head">{d}</div>)}
                  </div>
                  <div className="cal-grid">
                    {weeks.flatMap((wk, wi) => wk.map((cell, di) => {
                      if (!cell) return <div key={`e-${wi}-${di}`} />;
                      const apts = forDay(cell.ds);
                      const conf = apts.filter(a => a.status === 'confirmed').length;
                      const pend = apts.filter(a => a.status === 'pending_approval').length;
                      const isToday = cell.ds === today;
                      const isSel   = cell.ds === selectedDay;
                      return (
                        <div key={cell.ds}
                          className={`cal-cell${isToday ? ' today' : ''}${isSel ? ' selected' : ''}`}
                          onClick={() => { setSelectedDay(cell.ds); setSheetOpen(true); }}>
                          <div className="cal-num">{cell.day}</div>
                          <div className="cal-dots">
                            {Array.from({ length: Math.min(conf, 3) }).map((_, i) => <div key={`c${i}`} className="dot" style={{ background: '#16a34a' }} />)}
                            {Array.from({ length: Math.min(pend, 3) }).map((_, i) => <div key={`p${i}`} className="dot" style={{ background: '#d97706' }} />)}
                          </div>
                          {apts.length > 0 && <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>{apts.length}</div>}
                        </div>
                      );
                    }))}
                  </div>
                  <div style={{ display: 'flex', gap: 14, marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                    {[['#16a34a','Confirmed'],['#d97706','Pending']].map(([c, l]) => (
                      <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#64748b' }}>
                        <div className="dot" style={{ background: c }} /> {l}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Desktop: show day appointments below calendar */}
                {dayApts.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>
                      {selectedDay === today ? 'Today' : fmtDateLong(selectedDay)} · {dayApts.length} appointment{dayApts.length !== 1 ? 's' : ''}
                    </div>
                    <div className="card-list">
                      {dayApts.map(apt => (
                        <AptCard key={apt.id} apt={apt}
                          actionLoading={actionLoading[apt.id]}
                          actionError={actionError[apt.id]}
                          onApprove={() => handleAction(apt.id, true)}
                          onReject={() => handleAction(apt.id, false)}
                          onOpen={() => setDetailApt(apt)} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Bookings tab ── */}
            {tab === 'bookings' && (
              <>
                <div className="filter-bar">
                  <input className="search-input" type="search" placeholder="Search name or phone…"
                    value={search} onChange={e => setSearch(e.target.value)} />
                  <div className="pill-row">
                    {[['all','All'],['pending_approval','Pending'],['confirmed','Confirmed'],['rejected','Rejected']].map(([k, l]) => (
                      <button type="button" key={k} className={`pill${filterStatus === k ? ' on' : ''}`} onClick={() => setFilterStatus(k)}>{l}</button>
                    ))}
                  </div>
                </div>

                {/* Mobile: card list */}
                <div className="card-list" style={{ display: 'none' }} id="mobile-bookings">
                  {filtered.map(apt => (
                    <AptCard key={apt.id} apt={apt}
                      actionLoading={actionLoading[apt.id]}
                      actionError={actionError[apt.id]}
                      onApprove={() => handleAction(apt.id, true)}
                      onReject={() => handleAction(apt.id, false)} />
                  ))}
                </div>

                {/* Desktop: table */}
                <div className="desktop-table" style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Patient</th>
                          <th>Phone</th>
                          <th>Date & Time</th>
                          <th>Payment</th>
                          <th>Source</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.length === 0 && (
                          <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>No appointments found</td></tr>
                        )}
                        {filtered.map(apt => (
                          <tr key={apt.id} style={{ cursor: 'pointer' }} onClick={() => setDetailApt(apt)}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Avatar name={apt.patient_name} size={28} />
                                <span style={{ fontWeight: 600, color: '#0f172a' }}>{apt.patient_name || 'Unknown'}</span>
                              </div>
                            </td>
                            <td style={{ color: '#64748b', fontSize: 12 }}>{apt.phone}</td>
                            <td>
                              <div style={{ fontWeight: 500, fontSize: 12 }}>{fmtDate(apt.date)}</div>
                              <div style={{ fontWeight: 700, color: '#ea580c', fontSize: 12 }}>{apt.time}</div>
                            </td>
                            <td style={{ fontSize: 12 }}>
                              {apt.payment_method === 'medical_aid'
                                ? <div><div style={{ fontWeight: 600 }}>{apt.medical_aid}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>#{apt.membership_number}</div></div>
                                : <span style={{ color: '#16a34a', fontWeight: 600 }}>Cash</span>}
                            </td>
                            <td><SourceBadge source={apt.source} /></td>
                            <td><StatusBadge status={apt.status} /></td>
                            <td onClick={e => e.stopPropagation()}>
                              {apt.status === 'pending_approval' && (
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button type="button" disabled={actionLoading[apt.id]} onClick={() => handleAction(apt.id, true)}
                                    style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 5, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                    {actionLoading[apt.id] ? '…' : 'Approve'}
                                  </button>
                                  <button type="button" disabled={actionLoading[apt.id]} onClick={() => handleAction(apt.id, false)}
                                    style={{ background: '#fff', color: '#dc2626', border: '1px solid #dc2626', borderRadius: 5, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                    {actionLoading[apt.id] ? '…' : 'Reject'}
                                  </button>
                                </div>
                              )}
                              {actionError[apt.id] && <p style={{ color: '#dc2626', fontSize: 11, marginTop: 4 }}>{actionError[apt.id]}</p>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ padding: '8px 14px', borderTop: '1px solid #f1f5f9', fontSize: 12, color: '#94a3b8' }}>
                    {filtered.length} of {appointments.length} appointments
                  </div>
                </div>
              </>
            )}

            {/* ── Pending tab ── */}
            {tab === 'pending' && (
              pending.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '48px 24px', textAlign: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#16a34a', marginBottom: 6 }}>All clear</div>
                  <p style={{ fontSize: 13, color: '#94a3b8' }}>No pending approvals</p>
                </div>
              ) : (
                <div className="pending-grid">
                  {pending.map(apt => (
                    <div key={apt.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', borderTop: '3px solid #d97706', overflow: 'hidden' }}>
                      <div style={{ padding: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                          <Avatar name={apt.patient_name} size={38} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{apt.patient_name || 'Unknown'}</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>{apt.phone}</div>
                            <div style={{ marginTop: 3 }}><SourceBadge source={apt.source} /></div>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                          <div style={{ background: '#f8fafc', borderRadius: 6, padding: '8px 10px' }}>
                            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>Date</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{fmtDate(apt.date)}</div>
                          </div>
                          <div style={{ background: '#fff7ed', borderRadius: 6, padding: '8px 10px' }}>
                            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>Time</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#ea580c' }}>{apt.time}</div>
                          </div>
                          <div style={{ background: '#f8fafc', borderRadius: 6, padding: '8px 10px', gridColumn: '1/-1' }}>
                            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>Payment</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                              {apt.payment_method === 'medical_aid' ? `${apt.medical_aid} · #${apt.membership_number}` : 'Cash'}
                            </div>
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>Submitted {fmtTs(apt.created_at)}</div>
                        {actionError[apt.id] && <p style={{ color: '#dc2626', fontSize: 12, marginTop: 6 }}>{actionError[apt.id]}</p>}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid #f1f5f9' }}>
                        <button type="button" disabled={actionLoading[apt.id]} onClick={() => handleAction(apt.id, true)}
                          style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: '0 0 0 11px', padding: '12px 0', fontSize: 13, fontWeight: 600, cursor: actionLoading[apt.id] ? 'not-allowed' : 'pointer', opacity: actionLoading[apt.id] ? .5 : 1 }}>
                          {actionLoading[apt.id] ? '…' : 'Approve'}
                        </button>
                        <button type="button" disabled={actionLoading[apt.id]} onClick={() => handleAction(apt.id, false)}
                          style={{ background: '#fff', color: '#dc2626', border: 'none', borderLeft: '1px solid #f1f5f9', borderRadius: '0 0 11px 0', padding: '12px 0', fontSize: 13, fontWeight: 600, cursor: actionLoading[apt.id] ? 'not-allowed' : 'pointer', opacity: actionLoading[apt.id] ? .5 : 1 }}>
                          {actionLoading[apt.id] ? '…' : 'Reject'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

          </main>

          {/* ── Desktop sidebar ── */}
          <aside className="sidebar">
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                {selectedDay === today ? 'Today' : fmtDateLong(selectedDay)}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                {dayApts.length === 0 ? 'No appointments' : `${dayApts.length} appointment${dayApts.length !== 1 ? 's' : ''}`}
              </div>
            </div>
            {dayApts.length === 0
              ? <div style={{ textAlign: 'center', padding: '32px 0', color: '#cbd5e1', fontSize: 13 }}>Nothing scheduled</div>
              : <div className="card-list">
                  {dayApts.map(apt => (
                    <AptCard key={apt.id} apt={apt}
                      actionLoading={actionLoading[apt.id]}
                      actionError={actionError[apt.id]}
                      onApprove={() => handleAction(apt.id, true)}
                      onReject={() => handleAction(apt.id, false)} />
                  ))}
                </div>
            }
          </aside>
        </div>

        {/* ── Mobile bottom nav ── */}
        <nav className="bottom-nav">
          {tabConfig.map(t => (
            <button key={t.key} className={`bnav-btn${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
              <span className="bnav-icon">{t.icon}</span>
              <span>{t.mobileLabel || t.key.charAt(0).toUpperCase() + t.key.slice(1)}</span>
              {t.key === 'pending' && pending.length > 0 && (
                <span style={{ position: 'absolute', top: 6, background: '#dc2626', color: '#fff', borderRadius: 10, padding: '1px 5px', fontSize: 9, fontWeight: 700 }}>{pending.length}</span>
              )}
            </button>
          ))}
        </nav>

        {/* ── Mobile bottom sheet (day appointments) ── */}
        <div className={`sheet-overlay${sheetOpen ? ' open' : ''}`} onClick={() => setSheetOpen(false)} />
        <div className={`sheet${sheetOpen ? ' open' : ''}`}>
          <div className="sheet-handle" />
          <div className="sheet-header">
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                {selectedDay === today ? 'Today' : fmtDateLong(selectedDay)}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                {dayApts.length === 0 ? 'No appointments' : `${dayApts.length} appointment${dayApts.length !== 1 ? 's' : ''}`}
              </div>
            </div>
            <button type="button" onClick={() => setSheetOpen(false)}
              style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 14, color: '#64748b' }}>✕</button>
          </div>
          <div className="sheet-body">
            {dayApts.length === 0
              ? <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: '24px 0' }}>Nothing scheduled for this day</p>
              : <div className="card-list">
                  {dayApts.map(apt => (
                    <AptCard key={apt.id} apt={apt}
                      actionLoading={actionLoading[apt.id]}
                      actionError={actionError[apt.id]}
                      onApprove={() => handleAction(apt.id, true)}
                      onReject={() => handleAction(apt.id, false)} />
                  ))}
                </div>
            }
          </div>
        </div>

        {/* ── Patient detail sheet ── */}
        {detailApt && (
          <>
            <div className="sheet-overlay open" onClick={() => setDetailApt(null)} />
            <div className="sheet open" style={{ maxHeight: '85vh' }}>
              <div className="sheet-handle" />
              <div className="sheet-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar name={detailApt.patient_name} size={40} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{detailApt.patient_name || 'Unknown'}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>{detailApt.phone}</div>
                  </div>
                </div>
                <button type="button" onClick={() => setDetailApt(null)}
                  style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 14, color: '#64748b', flexShrink: 0 }}>✕</button>
              </div>
              <div className="sheet-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                  {[
                    ['Date',    fmtDateLong(detailApt.date)],
                    ['Time',    detailApt.time],
                    ['Status',  null],
                    ['Source',  null],
                  ].map(([label, value]) => (
                    <div key={label} style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>{label}</div>
                      {label === 'Status'  && <StatusBadge status={detailApt.status} />}
                      {label === 'Source'  && <SourceBadge source={detailApt.source} />}
                      {value && <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{value}</div>}
                    </div>
                  ))}
                </div>

                <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px', marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>Payment</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                    {detailApt.payment_method === 'medical_aid' ? 'Medical Aid' : 'Cash'}
                  </div>
                  {detailApt.payment_method === 'medical_aid' && (
                    <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>Provider</div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{detailApt.medical_aid || '—'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>Plan</div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{detailApt.medical_plan || '—'}</div>
                      </div>
                      <div style={{ gridColumn: '1/-1' }}>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>Membership No.</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{detailApt.membership_number || '—'}</div>
                      </div>
                    </div>
                  )}
                </div>

                {detailApt.email && (
                  <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>Email</div>
                    <div style={{ fontSize: 13, color: '#0f172a' }}>{detailApt.email}</div>
                  </div>
                )}

                {detailApt.reason && (
                  <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>Reason for Visit</div>
                    <div style={{ fontSize: 13, color: '#0f172a', lineHeight: 1.5 }}>{detailApt.reason}</div>
                  </div>
                )}

                <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>Booking Submitted</div>
                  <div style={{ fontSize: 13, color: '#0f172a' }}>{fmtTs(detailApt.created_at)}</div>
                </div>

                {detailApt.status === 'pending_approval' && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button type="button" disabled={actionLoading[detailApt.id]}
                      onClick={() => { handleAction(detailApt.id, true); setDetailApt(null); }}
                      style={{ flex: 1, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                      Approve
                    </button>
                    <button type="button" disabled={actionLoading[detailApt.id]}
                      onClick={() => { handleAction(detailApt.id, false); setDetailApt(null); }}
                      style={{ flex: 1, background: '#fff', color: '#dc2626', border: '1px solid #dc2626', borderRadius: 8, padding: '12px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

      </div>
    </>
  );
}
