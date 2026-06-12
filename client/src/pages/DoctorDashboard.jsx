import React, { useEffect, useState, useRef, useCallback } from 'react';
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
    return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
};

const statusMap = {
  pending_approval: { label: 'Pending',   bg: 'linear-gradient(135deg,#fffbeb,#fef3c7)', color: '#92400e', border: '#fcd34d', dot: '#f59e0b' },
  confirmed:        { label: 'Confirmed', bg: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', color: '#14532d', border: '#86efac', dot: '#22c55e' },
  rejected:         { label: 'Rejected',  bg: 'linear-gradient(135deg,#fef2f2,#fee2e2)', color: '#7f1d1d', border: '#fca5a5', dot: '#ef4444' },
};

const StatusBadge = ({ status }) => {
  const s = statusMap[status] || { label: status, bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0', dot: '#94a3b8' };
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {s.label}
    </span>
  );
};

const SourceBadge = ({ source }) => (
  source === 'website'
    ? <span style={{ background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700 }}>🌐 Web</span>
    : <span style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', color: '#15803d', border: '1px solid #86efac', borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700 }}>💬 WhatsApp</span>
);

const Avatar = ({ name, size = 36 }) => {
  const initials = (name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const hue = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: `linear-gradient(135deg, hsl(${hue},55%,50%), hsl(${(hue+40)%360},55%,40%))`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: size * 0.35, flexShrink: 0, boxShadow: `0 2px 8px hsl(${hue},40%,50%,0.35)` }}>
      {initials}
    </div>
  );
};

const StatCard = ({ icon, label, value, color, bg }) => (
  <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 1px 4px rgba(15,23,42,0.06)', border: '1px solid #f1f5f9', flex: 1, minWidth: 0 }}>
    <div style={{ width: 44, height: 44, borderRadius: 12, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{icon}</div>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, marginTop: 2, whiteSpace: 'nowrap' }}>{label}</div>
    </div>
  </div>
);

const Toast = ({ toasts }) => (
  <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
    {toasts.map(t => (
      <div key={t.id} style={{ background: t.type === 'success' ? '#16a34a' : '#dc2626', color: '#fff', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: 8, animation: 'slideIn .25s ease', whiteSpace: 'nowrap' }}>
        {t.type === 'success' ? '✓' : '✕'} {t.message}
      </div>
    ))}
  </div>
);

const AptCard = ({ apt, actionLoading, onApprove, onReject, onOpen }) => (
  <div onClick={onOpen} style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', padding: '14px 16px', borderLeft: `4px solid ${apt.status === 'confirmed' ? '#22c55e' : apt.status === 'rejected' ? '#ef4444' : '#f59e0b'}`, cursor: 'pointer', boxShadow: '0 1px 4px rgba(15,23,42,0.05)', transition: 'box-shadow .2s, transform .2s' }}
    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(15,23,42,0.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
    onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(15,23,42,0.05)'; e.currentTarget.style.transform = 'none'; }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <Avatar name={apt.patient_name} size={34} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{apt.patient_name || 'Unknown'}</div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{apt.phone}</div>
      </div>
      <StatusBadge status={apt.status} />
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: apt.status === 'pending_approval' ? 10 : 0 }}>
      <span style={{ background: '#f8fafc', borderRadius: 6, padding: '3px 8px', fontSize: 12, color: '#475569', fontWeight: 500 }}>📅 {fmtDate(apt.date)}</span>
      <span style={{ background: '#fff7ed', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontWeight: 800, color: '#ea580c' }}>🕐 {apt.time}</span>
      <SourceBadge source={apt.source} />
    </div>
    {apt.status === 'pending_approval' && (
      <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
        <button type="button" disabled={actionLoading} onClick={onApprove}
          style={{ flex: 1, background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 0', fontSize: 13, fontWeight: 700, cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? .5 : 1, transition: 'opacity .15s' }}>
          {actionLoading ? '…' : '✓ Approve'}
        </button>
        <button type="button" disabled={actionLoading} onClick={onReject}
          style={{ flex: 1, background: '#fff', color: '#dc2626', border: '1.5px solid #fca5a5', borderRadius: 8, padding: '9px 0', fontSize: 13, fontWeight: 700, cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? .5 : 1, transition: 'opacity .15s' }}>
          {actionLoading ? '…' : '✕ Reject'}
        </button>
      </div>
    )}
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
  const [autoPilot, setAutoPilot]         = useState(() => localStorage.getItem('autopilot') === 'true');
  const autoProcessedRef                  = useRef(new Set());
  const [sheetOpen, setSheetOpen]         = useState(false);
  const [detailApt, setDetailApt]         = useState(null);
  const [now, setNow]                     = useState(new Date());
  const [toasts, setToasts]               = useState([]);

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { localStorage.setItem('autopilot', autoPilot); }, [autoPilot]);

  useEffect(() => {
    if (!autoPilot || appointments.length === 0) return;
    appointments.filter(a => a.status === 'pending_approval').forEach((apt, idx) => {
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
    try {
      await axios.post(`${API_BASE}/confirm-appointment`,
        { appointmentId: id, confirm, doctorName: 'Dr. SG Majeke' },
        { headers: { Authorization: `Bearer ${AUTH_TOKEN}`, 'Content-Type': 'application/json' } }
      );
      addToast(confirm ? 'Appointment approved ✓' : 'Appointment rejected', confirm ? 'success' : 'error');
    } catch (e) {
      addToast(e.response?.data?.error || 'Action failed', 'error');
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

  const todayApts     = forDay(today);
  const confirmedToday = todayApts.filter(a => a.status === 'confirmed').length;
  const weekStart     = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
  const thisWeekCount = appointments.filter(a => a.date >= weekStart.toISOString().split('T')[0] && a.date <= today).length;

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

  const tabConfig = [
    { key: 'calendar', label: 'Calendar',  icon: '📅' },
    { key: 'bookings', label: 'Bookings',  icon: '📋' },
    { key: 'pending',  label: `Pending${pending.length ? ` (${pending.length})` : ''}`, icon: '⏳', mobileLabel: 'Pending' },
  ];

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; -webkit-text-size-adjust: 100%; }
    body { background: #f0f4f8; font-family: 'Inter', system-ui, sans-serif; color: #1e293b; }

    .dash { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

    /* Topbar */
    .topbar {
      background: linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 60%, #2563eb 100%);
      padding: 0 24px; height: 60px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      box-shadow: 0 2px 20px rgba(30,58,138,0.4);
    }
    .topbar-brand { display: flex; align-items: center; gap: 12px; }

    .desktop-nav { display: flex; gap: 2px; }
    .nav-btn {
      background: rgba(255,255,255,0.1); border: none; padding: 7px 16px;
      border-radius: 8px; font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.75);
      cursor: pointer; transition: background .15s, color .15s; white-space: nowrap;
    }
    .nav-btn:hover  { background: rgba(255,255,255,0.2); color: #fff; }
    .nav-btn.active { background: rgba(255,255,255,0.22); color: #fff; font-weight: 700; }

    .topbar-actions { display: flex; align-items: center; gap: 8px; }

    /* Body */
    .body { display: flex; flex: 1; overflow: hidden; }
    .main { flex: 1; overflow-y: auto; padding: 20px 24px; -webkit-overflow-scrolling: touch; }
    .sidebar { width: 290px; min-width: 290px; flex-shrink: 0; border-left: 1px solid #e2e8f0; background: #fff; overflow-y: auto; padding: 20px; }

    /* Stats */
    .stats-row { display: flex; gap: 12px; margin-bottom: 20px; }

    /* Calendar */
    .cal-wrap { background: #fff; borderRadius: 16px; border: 1px solid #f1f5f9; padding: 16px; box-shadow: 0 1px 4px rgba(15,23,42,0.06); border-radius: 16px; }
    .cal-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .cal-grid { display: grid; grid-template-columns: repeat(7,1fr); gap: 3px; }
    .cal-head { font-size: 10px; font-weight: 800; color: #94a3b8; text-align: center; padding: 6px 0; text-transform: uppercase; letter-spacing: .5px; }
    .cal-cell { border-radius: 10px; min-height: 68px; padding: 6px; cursor: pointer; border: 1.5px solid transparent; transition: all .15s; position: relative; }
    .cal-cell:hover    { border-color: #c7d2fe; background: #f5f7ff; }
    .cal-cell.today    { background: linear-gradient(135deg,#fff7ed,#ffedd5); border-color: #fdba74; }
    .cal-cell.selected { background: linear-gradient(135deg,#eff6ff,#dbeafe); border-color: #3b82f6; }
    .cal-num { font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px; }
    .cal-cell.today .cal-num    { color: #ea580c; font-weight: 800; }
    .cal-cell.selected .cal-num { color: #1d4ed8; font-weight: 800; }
    .cal-dots { display: flex; flex-wrap: wrap; gap: 2px; }
    .dot { width: 5px; height: 5px; border-radius: 50%; }

    /* Card list */
    .card-list { display: flex; flex-direction: column; gap: 10px; }

    /* Pending grid */
    .pending-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }

    /* Filters */
    .filter-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 16px; }
    .search-input { flex: 1; min-width: 140px; max-width: 280px; background: #fff; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 9px 14px; font-size: 13px; color: #1e293b; box-shadow: 0 1px 3px rgba(15,23,42,0.04); }
    .search-input:focus { outline: 2px solid #3b82f6; outline-offset: 1px; border-color: transparent; }
    .pill-row { display: flex; gap: 5px; flex-wrap: wrap; }
    .pill { background: #fff; border: 1.5px solid #e2e8f0; border-radius: 20px; padding: 5px 14px; font-size: 12px; font-weight: 600; color: #64748b; cursor: pointer; white-space: nowrap; transition: all .15s; }
    .pill:hover { border-color: #3b82f6; color: #1d4ed8; }
    .pill.on { background: linear-gradient(135deg,#1d4ed8,#2563eb); border-color: transparent; color: #fff; }

    /* Badges */
    .badge-pending { background: linear-gradient(135deg,#fef3c7,#fde68a); color: #92400e; border: 1px solid #fcd34d; border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 800; }
    .ap-btn { display: flex; align-items: center; gap: 5px; border: none; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 700; cursor: pointer; }
    .ap-btn.on  { background: linear-gradient(135deg,#16a34a,#15803d); color: #fff; }
    .ap-btn.off { background: rgba(255,255,255,0.15); color: rgba(255,255,255,0.8); }
    .ap-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .ap-btn.on  .ap-dot { background: #bbf7d0; animation: pulse 1.4s infinite; }
    .ap-btn.off .ap-dot { background: rgba(255,255,255,0.4); }

    /* Table */
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 540px; }
    th { padding: 12px 14px; text-align: left; font-size: 10.5px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .5px; border-bottom: 1px solid #f1f5f9; white-space: nowrap; background: #fafafa; }
    th:first-child { border-radius: 0 0 0 0; }
    td { padding: 12px 14px; border-bottom: 1px solid #f8fafc; vertical-align: middle; }
    tr:hover td { background: #f8fafc; }
    tr:last-child td { border-bottom: none; }

    /* Bottom sheet */
    .sheet-overlay { display: none; position: fixed; inset: 0; background: rgba(15,23,42,.5); z-index: 100; backdrop-filter: blur(2px); }
    .sheet-overlay.open { display: block; }
    .sheet { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-radius: 20px 20px 0 0; z-index: 101; max-height: 80vh; display: flex; flex-direction: column; transform: translateY(100%); transition: transform .3s cubic-bezier(.4,0,.2,1); }
    .sheet.open { transform: translateY(0); }
    .sheet-handle { width: 40px; height: 4px; background: #e2e8f0; border-radius: 2px; margin: 14px auto 0; flex-shrink: 0; }
    .sheet-header { padding: 14px 18px 12px; border-bottom: 1px solid #f1f5f9; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; }
    .sheet-body { overflow-y: auto; padding: 16px 18px 32px; flex: 1; -webkit-overflow-scrolling: touch; }

    /* Section header */
    .section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
    .section-title { font-size: 15px; font-weight: 800; color: '#0f172a'; }

    /* Bottom nav — mobile only */
    .bottom-nav { display: none; }

    @keyframes spin    { to { transform: rotate(360deg); } }
    @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.3} }
    @keyframes slideIn { from { transform: translateX(60px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    .spinner { width: 32px; height: 32px; border: 3px solid #e2e8f0; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; }

    /* Mobile */
    @media (max-width: 768px) {
      .topbar { padding: 0 16px; height: 54px; }
      .desktop-nav { display: none; }
      .sidebar { display: none; }
      .main { padding: 12px 14px 76px; }
      .stats-row { gap: 8px; }
      .cal-cell { min-height: 48px; padding: 4px; }
      .cal-num { font-size: 11px; }
      .pending-grid { grid-template-columns: 1fr; }
      .ap-label { display: none; }
      #mobile-bookings { display: flex !important; }
      .desktop-table { display: none; }
      .bottom-nav {
        display: flex; position: fixed; bottom: 0; left: 0; right: 0;
        background: #fff; border-top: 1px solid #f1f5f9;
        height: 62px; z-index: 50; box-shadow: 0 -4px 20px rgba(15,23,42,0.08);
      }
      .bnav-btn {
        flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 3px; background: none; border: none; cursor: pointer;
        font-size: 10px; font-weight: 600; color: #94a3b8; padding: 0;
        transition: color .15s;
      }
      .bnav-btn.active { color: #1d4ed8; }
      .bnav-icon { font-size: 20px; line-height: 1; }
    }
    @media (max-width: 380px) {
      .topbar-brand span { display: none; }
    }
  `;

  if (loading) return (
    <>
      <style>{css}</style>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f0f4f8', gap: 16 }}>
        <div className="spinner" />
        <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>Loading appointments…</div>
      </div>
    </>
  );

  if (error) return (
    <>
      <style>{css}</style>
      <div style={{ padding: 24, color: '#dc2626', fontSize: 14 }}>{error}</div>
    </>
  );

  return (
    <>
      <style>{css}</style>
      <Toast toasts={toasts} />
      <div className="dash">

        {/* ── Topbar ── */}
        <header className="topbar">
          <div className="topbar-brand">
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🩺</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>Dr. SG Majeke</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>General Practitioner</div>
            </div>
          </div>

          <nav className="desktop-nav">
            {tabConfig.map(t => (
              <button key={t.key} className={`nav-btn${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
                {t.icon} {t.label}
              </button>
            ))}
          </nav>

          <div className="topbar-actions">
            <button type="button" className={`ap-btn ${autoPilot ? 'on' : 'off'}`}
              onClick={() => { if (!autoPilot) autoProcessedRef.current.clear(); setAutoPilot(p => !p); }}
              title={autoPilot ? 'Auto Pilot ON — click to disable' : 'Enable Auto Pilot'}>
              <span className="ap-dot" />
              <span className="ap-label">Auto {autoPilot ? 'ON' : 'OFF'}</span>
            </button>
            {pending.length > 0 && <span className="badge-pending">{pending.length}</span>}
          </div>
        </header>

        {/* ── Body ── */}
        <div className="body">
          <main className="main">

            {/* Stats row */}
            <div className="stats-row">
              <StatCard icon="📅" label="Today's Appts"  value={todayApts.length}    color="#1d4ed8" bg="linear-gradient(135deg,#eff6ff,#dbeafe)" />
              <StatCard icon="⏳" label="Pending"         value={pending.length}       color="#d97706" bg="linear-gradient(135deg,#fffbeb,#fef3c7)" />
              <StatCard icon="✅" label="Confirmed Today" value={confirmedToday}        color="#15803d" bg="linear-gradient(135deg,#f0fdf4,#dcfce7)" />
              <StatCard icon="📊" label="This Week"       value={thisWeekCount}         color="#7c3aed" bg="linear-gradient(135deg,#faf5ff,#ede9fe)" />
            </div>

            {/* ── Calendar tab ── */}
            {tab === 'calendar' && (
              <>
                <div className="cal-wrap">
                  <div className="cal-nav">
                    <button type="button" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1))}
                      style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 14, color: '#334155', fontWeight: 700 }}>‹</button>
                    <span style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>{monthStr}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" onClick={() => { setMonth(new Date()); setSelectedDay(today); }}
                        style={{ background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', border: '1px solid #bfdbfe', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer', color: '#1d4ed8', fontWeight: 700 }}>Today</button>
                      <button type="button" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1))}
                        style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 14, color: '#334155', fontWeight: 700 }}>›</button>
                    </div>
                  </div>

                  <div className="cal-grid" style={{ marginBottom: 4 }}>
                    {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => <div key={i} className="cal-head">{d}</div>)}
                  </div>
                  <div className="cal-grid">
                    {weeks.flatMap((wk, wi) => wk.map((cell, di) => {
                      if (!cell) return <div key={`e-${wi}-${di}`} />;
                      const apts  = forDay(cell.ds);
                      const conf  = apts.filter(a => a.status === 'confirmed').length;
                      const pend  = apts.filter(a => a.status === 'pending_approval').length;
                      const isTod = cell.ds === today;
                      const isSel = cell.ds === selectedDay;
                      return (
                        <div key={cell.ds}
                          className={`cal-cell${isTod ? ' today' : ''}${isSel ? ' selected' : ''}`}
                          onClick={() => { setSelectedDay(cell.ds); setSheetOpen(true); }}>
                          <div className="cal-num">{cell.day}</div>
                          <div className="cal-dots">
                            {Array.from({ length: Math.min(conf, 4) }).map((_, i) => <div key={`c${i}`} className="dot" style={{ background: '#22c55e' }} />)}
                            {Array.from({ length: Math.min(pend, 4) }).map((_, i) => <div key={`p${i}`} className="dot" style={{ background: '#f59e0b' }} />)}
                          </div>
                          {apts.length > 0 && <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2, fontWeight: 600 }}>{apts.length} appt{apts.length > 1 ? 's' : ''}</div>}
                        </div>
                      );
                    }))}
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                    {[['#22c55e','Confirmed'],['#f59e0b','Pending'],['#ef4444','Rejected']].map(([c, l]) => (
                      <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748b', fontWeight: 500 }}>
                        <div className="dot" style={{ background: c }} /> {l}
                      </div>
                    ))}
                  </div>
                </div>

                {dayApts.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <div className="section-head">
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                        {selectedDay === today ? '📅 Today' : `📅 ${fmtDateLong(selectedDay)}`}
                        <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>{dayApts.length} appointment{dayApts.length !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <div className="card-list">
                      {dayApts.map(apt => (
                        <AptCard key={apt.id} apt={apt}
                          actionLoading={actionLoading[apt.id]}
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
                  <input className="search-input" type="search" placeholder="🔍  Search name or phone…"
                    value={search} onChange={e => setSearch(e.target.value)} />
                  <div className="pill-row">
                    {[['all','All'],['pending_approval','Pending'],['confirmed','Confirmed'],['rejected','Rejected']].map(([k, l]) => (
                      <button type="button" key={k} className={`pill${filterStatus === k ? ' on' : ''}`} onClick={() => setFilterStatus(k)}>{l}</button>
                    ))}
                  </div>
                </div>

                {/* Mobile cards */}
                <div className="card-list" style={{ display: 'none' }} id="mobile-bookings">
                  {filtered.map(apt => (
                    <AptCard key={apt.id} apt={apt}
                      actionLoading={actionLoading[apt.id]}
                      onApprove={() => handleAction(apt.id, true)}
                      onReject={() => handleAction(apt.id, false)}
                      onOpen={() => setDetailApt(apt)} />
                  ))}
                </div>

                {/* Desktop table */}
                <div className="desktop-table" style={{ background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
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
                          <tr><td colSpan={7} style={{ textAlign: 'center', padding: '48px 0', color: '#cbd5e1' }}>
                            <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>No appointments found</div>
                          </td></tr>
                        )}
                        {filtered.map(apt => (
                          <tr key={apt.id} style={{ cursor: 'pointer' }} onClick={() => setDetailApt(apt)}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <Avatar name={apt.patient_name} size={30} />
                                <span style={{ fontWeight: 700, color: '#0f172a' }}>{apt.patient_name || 'Unknown'}</span>
                              </div>
                            </td>
                            <td style={{ color: '#64748b', fontSize: 12 }}>{apt.phone}</td>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: 12, color: '#334155' }}>{fmtDate(apt.date)}</div>
                              <div style={{ fontWeight: 800, color: '#ea580c', fontSize: 13 }}>{apt.time}</div>
                            </td>
                            <td style={{ fontSize: 12 }}>
                              {apt.payment_method === 'medical_aid'
                                ? <div><div style={{ fontWeight: 700, color: '#0f172a' }}>{apt.medical_aid}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>#{apt.membership_number}</div></div>
                                : <span style={{ background: '#f0fdf4', color: '#15803d', borderRadius: 6, padding: '2px 8px', fontWeight: 700, fontSize: 11 }}>Cash</span>}
                            </td>
                            <td><SourceBadge source={apt.source} /></td>
                            <td><StatusBadge status={apt.status} /></td>
                            <td onClick={e => e.stopPropagation()}>
                              {apt.status === 'pending_approval' && (
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button type="button" disabled={actionLoading[apt.id]} onClick={() => handleAction(apt.id, true)}
                                    style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                    ✓ Approve
                                  </button>
                                  <button type="button" disabled={actionLoading[apt.id]} onClick={() => handleAction(apt.id, false)}
                                    style={{ background: '#fff', color: '#dc2626', border: '1.5px solid #fca5a5', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                    ✕ Reject
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ padding: '10px 16px', borderTop: '1px solid #f8fafc', fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>
                    Showing {filtered.length} of {appointments.length} appointments
                  </div>
                </div>
              </>
            )}

            {/* ── Pending tab ── */}
            {tab === 'pending' && (
              pending.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9', padding: '60px 24px', textAlign: 'center', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#15803d', marginBottom: 6 }}>All clear!</div>
                  <p style={{ fontSize: 13, color: '#94a3b8' }}>No pending approvals right now</p>
                </div>
              ) : (
                <div className="pending-grid">
                  {pending.map(apt => (
                    <div key={apt.id} style={{ background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9', borderTop: '4px solid #f59e0b', overflow: 'hidden', boxShadow: '0 2px 8px rgba(245,158,11,0.1)' }}>
                      <div style={{ padding: 18 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                          <Avatar name={apt.patient_name} size={42} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{apt.patient_name || 'Unknown'}</div>
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>{apt.phone}</div>
                            <div style={{ marginTop: 4 }}><SourceBadge source={apt.source} /></div>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                          <div style={{ background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)', borderRadius: 10, padding: '10px 12px' }}>
                            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 }}>📅 Date</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{fmtDate(apt.date)}</div>
                          </div>
                          <div style={{ background: 'linear-gradient(135deg,#fff7ed,#ffedd5)', borderRadius: 10, padding: '10px 12px' }}>
                            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 }}>🕐 Time</div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: '#ea580c' }}>{apt.time}</div>
                          </div>
                          <div style={{ background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)', borderRadius: 10, padding: '10px 12px', gridColumn: '1/-1' }}>
                            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 }}>💳 Payment</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                              {apt.payment_method === 'medical_aid' ? `${apt.medical_aid} · #${apt.membership_number}` : 'Cash'}
                            </div>
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>Submitted {fmtTs(apt.created_at)}</div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid #f1f5f9' }}>
                        <button type="button" disabled={actionLoading[apt.id]} onClick={() => handleAction(apt.id, true)}
                          style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', padding: '14px 0', fontSize: 14, fontWeight: 700, cursor: actionLoading[apt.id] ? 'not-allowed' : 'pointer', opacity: actionLoading[apt.id] ? .5 : 1, borderRadius: '0 0 0 12px' }}>
                          {actionLoading[apt.id] ? '…' : '✓ Approve'}
                        </button>
                        <button type="button" disabled={actionLoading[apt.id]} onClick={() => handleAction(apt.id, false)}
                          style={{ background: '#fff', color: '#dc2626', border: 'none', borderLeft: '1px solid #f1f5f9', padding: '14px 0', fontSize: 14, fontWeight: 700, cursor: actionLoading[apt.id] ? 'not-allowed' : 'pointer', opacity: actionLoading[apt.id] ? .5 : 1, borderRadius: '0 0 12px 0' }}>
                          {actionLoading[apt.id] ? '…' : '✕ Reject'}
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
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                {selectedDay === today ? '📅 Today' : `📅 ${fmtDateLong(selectedDay)}`}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3, fontWeight: 500 }}>
                {dayApts.length === 0 ? 'No appointments' : `${dayApts.length} appointment${dayApts.length !== 1 ? 's' : ''}`}
              </div>
            </div>
            {dayApts.length === 0
              ? <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🗓️</div>
                  <div style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 500 }}>Nothing scheduled</div>
                </div>
              : <div className="card-list">
                  {dayApts.map(apt => (
                    <AptCard key={apt.id} apt={apt}
                      actionLoading={actionLoading[apt.id]}
                      onApprove={() => handleAction(apt.id, true)}
                      onReject={() => handleAction(apt.id, false)}
                      onOpen={() => setDetailApt(apt)} />
                  ))}
                </div>
            }
          </aside>
        </div>

        {/* ── Mobile bottom nav ── */}
        <nav className="bottom-nav">
          {tabConfig.map(t => (
            <button key={t.key} className={`bnav-btn${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)} style={{ position: 'relative' }}>
              <span className="bnav-icon">{t.icon}</span>
              <span>{t.mobileLabel || t.label.split(' ')[0]}</span>
              {t.key === 'pending' && pending.length > 0 && (
                <span style={{ position: 'absolute', top: 8, right: '25%', background: '#dc2626', color: '#fff', borderRadius: 10, padding: '1px 5px', fontSize: 9, fontWeight: 800 }}>{pending.length}</span>
              )}
            </button>
          ))}
        </nav>

        {/* ── Mobile day sheet ── */}
        <div className={`sheet-overlay${sheetOpen ? ' open' : ''}`} onClick={() => setSheetOpen(false)} />
        <div className={`sheet${sheetOpen ? ' open' : ''}`}>
          <div className="sheet-handle" />
          <div className="sheet-header">
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                {selectedDay === today ? '📅 Today' : `📅 ${fmtDateLong(selectedDay)}`}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, fontWeight: 500 }}>
                {dayApts.length === 0 ? 'No appointments' : `${dayApts.length} appointment${dayApts.length !== 1 ? 's' : ''}`}
              </div>
            </div>
            <button type="button" onClick={() => setSheetOpen(false)}
              style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', fontSize: 14, color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
          <div className="sheet-body">
            {dayApts.length === 0
              ? <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: '32px 0' }}>Nothing scheduled for this day</p>
              : <div className="card-list">
                  {dayApts.map(apt => (
                    <AptCard key={apt.id} apt={apt}
                      actionLoading={actionLoading[apt.id]}
                      onApprove={() => handleAction(apt.id, true)}
                      onReject={() => handleAction(apt.id, false)}
                      onOpen={() => { setSheetOpen(false); setDetailApt(apt); }} />
                  ))}
                </div>
            }
          </div>
        </div>

        {/* ── Patient detail sheet ── */}
        {detailApt && (
          <>
            <div className="sheet-overlay open" onClick={() => setDetailApt(null)} />
            <div className="sheet open" style={{ maxHeight: '88vh' }}>
              <div className="sheet-handle" />
              <div className="sheet-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Avatar name={detailApt.patient_name} size={44} />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>{detailApt.patient_name || 'Unknown'}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 1 }}>{detailApt.phone}</div>
                  </div>
                </div>
                <button type="button" onClick={() => setDetailApt(null)}
                  style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', fontSize: 14, color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
              </div>
              <div className="sheet-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  {[['📅 Date', fmtDateLong(detailApt.date)], ['🕐 Time', detailApt.time]].map(([label, value]) => (
                    <div key={label} style={{ background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)', borderRadius: 12, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 5 }}>{label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: label.includes('Time') ? '#ea580c' : '#0f172a' }}>{value}</div>
                    </div>
                  ))}
                  <div style={{ background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)', borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 5 }}>Status</div>
                    <StatusBadge status={detailApt.status} />
                  </div>
                  <div style={{ background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)', borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 5 }}>Source</div>
                    <SourceBadge source={detailApt.source} />
                  </div>
                </div>

                <div style={{ background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)', borderRadius: 12, padding: '14px', marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>💳 Payment</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                    {detailApt.payment_method === 'medical_aid' ? 'Medical Aid' : 'Cash'}
                  </div>
                  {detailApt.payment_method === 'medical_aid' && (
                    <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>Provider</div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{detailApt.medical_aid || '—'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>Membership No.</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{detailApt.membership_number || '—'}</div>
                      </div>
                    </div>
                  )}
                </div>

                {detailApt.reason && (
                  <div style={{ background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)', borderRadius: 12, padding: '12px 14px', marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 5 }}>🩺 Reason for Visit</div>
                    <div style={{ fontSize: 13, color: '#0f172a', lineHeight: 1.6 }}>{detailApt.reason}</div>
                  </div>
                )}

                <div style={{ background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 5 }}>🕑 Submitted</div>
                  <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 500 }}>{fmtTs(detailApt.created_at)}</div>
                </div>

                {detailApt.status === 'pending_approval' && (
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button type="button" disabled={actionLoading[detailApt.id]}
                      onClick={() => { handleAction(detailApt.id, true); setDetailApt(null); }}
                      style={{ flex: 1, background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', borderRadius: 12, padding: '14px 0', fontSize: 15, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(22,163,74,0.3)' }}>
                      ✓ Approve
                    </button>
                    <button type="button" disabled={actionLoading[detailApt.id]}
                      onClick={() => { handleAction(detailApt.id, false); setDetailApt(null); }}
                      style={{ flex: 1, background: '#fff', color: '#dc2626', border: '2px solid #fca5a5', borderRadius: 12, padding: '14px 0', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
                      ✕ Reject
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
