import React, { useEffect, useState, useRef, useCallback } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import axios from 'axios';
import {
  Check, X, Clock, Phone, CreditCard, Stethoscope,
  AlertCircle, CalendarDays, User, MessageCircle, Globe,
  Loader2, Search, ChevronDown,
} from 'lucide-react';

const API_BASE   = process.env.REACT_APP_API_URL    || 'http://localhost:3000';
const AUTH_TOKEN = process.env.REACT_APP_DOCTOR_TOKEN || '';

const pad      = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };

const fmtDate = s => {
  try { return new Date(s + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return s; }
};
const fmtDateShort = s => {
  try { return new Date(s + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }); }
  catch { return s; }
};
const fmtTs = ts => {
  if (!ts) return '';
  try {
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};

const STATUS = {
  pending_approval: { label: 'Pending',   color: '#92400e', bg: '#fef9c3' },
  confirmed:        { label: 'Confirmed', color: '#14532d', bg: '#dcfce7' },
  rejected:         { label: 'Rejected',  color: '#7f1d1d', bg: '#fee2e2' },
};

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-size: 14px; -webkit-text-size-adjust: 100%; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f3f4f6;
    color: #111827;
    height: 100vh;
    overflow: hidden;
  }

  .wrap { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

  /* ── Header ── */
  .hdr {
    background: #fff; border-bottom: 1px solid #e5e7eb;
    padding: 0 24px; height: 52px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
  }
  .hdr-brand { display: flex; align-items: center; gap: 9px; }
  .hdr-icon  { color: #2563eb; flex-shrink: 0; }
  .hdr-name  { font-weight: 700; font-size: 15px; color: #111827; }
  .hdr-sep   { color: #d1d5db; margin: 0 2px; }
  .hdr-sub   { color: #9ca3af; font-size: 13px; }
  .hdr-right { display: flex; align-items: center; gap: 10px; }
  .hdr-date  { font-size: 13px; color: #6b7280; }

  .ap-btn {
    display: flex; align-items: center; gap: 6px;
    background: none; border: 1px solid #d1d5db; border-radius: 5px;
    padding: 5px 12px; font-size: 12px; font-weight: 500; color: #6b7280;
    cursor: pointer; transition: all .12s;
  }
  .ap-btn:hover { border-color: #9ca3af; color: #374151; }
  .ap-btn.on  { border-color: #16a34a; color: #15803d; font-weight: 600; }
  .ap-dot { width: 7px; height: 7px; border-radius: 50%; background: #d1d5db; flex-shrink: 0; }
  .ap-btn.on .ap-dot { background: #16a34a; }

  /* ── Toolbar ── */
  .toolbar {
    background: #fff; border-bottom: 1px solid #e5e7eb;
    padding: 10px 24px; flex-shrink: 0;
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  }
  .search-wrap {
    position: relative; flex: 1; min-width: 160px; max-width: 300px;
  }
  .search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #9ca3af; pointer-events: none; }
  .search-input {
    width: 100%; padding: 7px 10px 7px 32px;
    border: 1px solid #d1d5db; border-radius: 5px;
    font-size: 13px; color: #111827; background: #fff;
    outline: none;
  }
  .search-input:focus { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,.1); }

  .filter-pills { display: flex; gap: 5px; flex-wrap: wrap; }
  .pill {
    padding: 5px 13px; border-radius: 5px; font-size: 12px; font-weight: 500;
    border: 1px solid #d1d5db; background: #fff; color: #6b7280; cursor: pointer;
    display: flex; align-items: center; gap: 5px; transition: all .1s;
    white-space: nowrap;
  }
  .pill:hover { border-color: #9ca3af; color: #374151; }
  .pill.active { background: #111827; border-color: #111827; color: #fff; font-weight: 600; }
  .pill-count {
    background: rgba(255,255,255,.2); border-radius: 8px;
    padding: 0 5px; font-size: 10px; font-weight: 700;
  }
  .pill:not(.active) .pill-count { background: #f3f4f6; color: #6b7280; }

  /* ── Table area ── */
  .table-area { flex: 1; overflow-y: auto; }
  .tbl-wrap { min-width: 640px; }

  table { width: 100%; border-collapse: collapse; background: #fff; }
  thead th {
    padding: 10px 16px; text-align: left;
    font-size: 11px; font-weight: 600; color: #6b7280;
    text-transform: uppercase; letter-spacing: .5px;
    background: #f9fafb; border-bottom: 1px solid #e5e7eb;
    white-space: nowrap; user-select: none;
  }
  thead th:first-child { padding-left: 24px; }
  thead th:last-child  { padding-right: 24px; }

  tbody tr { border-bottom: 1px solid #f3f4f6; cursor: pointer; transition: background .07s; }
  tbody tr:hover { background: #f9fafb; }
  tbody tr:last-child { border-bottom: none; }
  td { padding: 13px 16px; vertical-align: middle; }
  td:first-child { padding-left: 24px; }
  td:last-child  { padding-right: 24px; }

  .td-name  { font-weight: 600; font-size: 14px; color: #111827; }
  .td-phone { font-size: 12px; color: #9ca3af; margin-top: 2px; display: flex; align-items: center; gap: 4px; }
  .td-date  { font-size: 13px; font-weight: 500; color: #374151; }
  .td-time  { display: flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 600; color: #2563eb; margin-top: 2px; }
  .td-pay   { font-size: 13px; color: #374151; }
  .td-pay-sub { font-size: 11px; color: #9ca3af; margin-top: 2px; }

  .src-badge {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 4px;
  }
  .src-wa  { background: #dcfce7; color: #15803d; }
  .src-web { background: #dbeafe; color: #1d4ed8; }

  .status-badge {
    display: inline-flex; align-items: center;
    font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 4px;
    white-space: nowrap;
  }

  .action-cell { display: flex; gap: 6px; align-items: center; }
  .btn-a {
    display: inline-flex; align-items: center; gap: 4px;
    background: #2563eb; color: #fff; border: none; border-radius: 4px;
    padding: 5px 11px; font-size: 12px; font-weight: 600; cursor: pointer;
    white-space: nowrap; transition: background .1s;
  }
  .btn-a:hover    { background: #1d4ed8; }
  .btn-a:disabled { opacity: .45; cursor: not-allowed; }
  .btn-r {
    display: inline-flex; align-items: center; gap: 4px;
    background: #fff; color: #dc2626; border: 1px solid #fca5a5;
    border-radius: 4px; padding: 5px 11px; font-size: 12px; font-weight: 600;
    cursor: pointer; white-space: nowrap; transition: all .1s;
  }
  .btn-r:hover    { background: #fef2f2; border-color: #dc2626; }
  .btn-r:disabled { opacity: .45; cursor: not-allowed; }

  .empty-row td { padding: 60px 0; text-align: center; color: #d1d5db; font-size: 13px; cursor: default; }
  .empty-row:hover { background: #fff !important; }

  .tbl-footer {
    background: #fff; border-top: 1px solid #e5e7eb;
    padding: 8px 24px; font-size: 12px; color: #9ca3af;
  }

  /* ── Detail pane ── */
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.2); z-index: 50; }
  .det-pane {
    position: fixed; top: 0; right: 0; bottom: 0;
    width: 360px; background: #fff; border-left: 1px solid #e5e7eb;
    z-index: 51; display: flex; flex-direction: column;
  }
  .det-hdr {
    padding: 15px 18px; border-bottom: 1px solid #f3f4f6;
    display: flex; align-items: center; gap: 10px; flex-shrink: 0;
  }
  .det-hdr-icon { color: #9ca3af; flex-shrink: 0; }
  .det-title { font-weight: 700; font-size: 15px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .det-close {
    background: none; border: none; cursor: pointer; color: #9ca3af;
    padding: 3px; border-radius: 3px; display: flex; align-items: center;
    transition: color .1s;
  }
  .det-close:hover { color: #111827; }
  .det-body { padding: 18px; flex: 1; overflow-y: auto; }
  .det-field { margin-bottom: 16px; }
  .det-lbl {
    display: flex; align-items: center; gap: 5px;
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .5px; color: #9ca3af; margin-bottom: 4px;
  }
  .det-val { font-size: 13px; font-weight: 500; color: #111827; }
  .det-actions { display: flex; gap: 10px; padding: 14px 18px; border-top: 1px solid #f3f4f6; flex-shrink: 0; }

  .spinner { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .banner {
    position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%);
    background: #111827; color: #fff; border-radius: 5px;
    padding: 9px 18px; font-size: 13px; font-weight: 500;
    z-index: 100; pointer-events: none; white-space: nowrap;
    animation: slideUp .15s ease;
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  @media (max-width: 680px) {
    .tbl-wrap { display: none; }
    .mobile-list { display: block !important; }
    .det-pane { width: 100%; border-left: none; }
    .hdr-sub, .hdr-sep { display: none; }
    .hdr { padding: 0 16px; }
    .toolbar { padding: 8px 14px; }
  }

  /* Mobile card list */
  .mobile-list { display: none; }
  .m-card {
    background: #fff; border-bottom: 1px solid #f3f4f6;
    padding: 13px 16px; cursor: pointer;
    display: flex; gap: 12px; align-items: flex-start;
    transition: background .07s;
  }
  .m-card:hover { background: #f9fafb; }
  .m-card-body { flex: 1; min-width: 0; }
  .m-card-name { font-weight: 600; font-size: 14px; color: #111827; }
  .m-card-meta { font-size: 12px; color: #6b7280; margin-top: 3px; display: flex; flex-wrap: wrap; gap: 8px; }
  .m-card-meta-item { display: flex; align-items: center; gap: 4px; }
  .m-card-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; }
  .m-card-actions { display: flex; gap: 6px; margin-top: 8px; }
`;

function StatusBadge({ status }) {
  const s = STATUS[status] || { label: status, color: '#374151', bg: '#f3f4f6' };
  return (
    <span className="status-badge" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function DetailPane({ apt, loading, onApprove, onReject, onClose }) {
  const s = STATUS[apt.status] || { label: apt.status, color: '#374151', bg: '#f3f4f6' };
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="det-pane">
        <div className="det-hdr">
          <User size={16} className="det-hdr-icon" />
          <span className="det-title">{apt.patient_name || 'Patient'}</span>
          <button className="det-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="det-body">
          <div className="det-field">
            <div className="det-lbl"><AlertCircle size={10} /> Status</div>
            <span className="status-badge" style={{ background: s.bg, color: s.color, fontSize: 12 }}>{s.label}</span>
          </div>
          <div className="det-field">
            <div className="det-lbl"><CalendarDays size={10} /> Date &amp; Time</div>
            <div className="det-val">{fmtDate(apt.date)}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: 13, fontWeight: 600, color: '#2563eb' }}>
              <Clock size={12} />{apt.time}
            </div>
          </div>
          <div className="det-field">
            <div className="det-lbl"><Phone size={10} /> Phone</div>
            <div className="det-val">{apt.phone}</div>
          </div>
          <div className="det-field">
            <div className="det-lbl"><CreditCard size={10} /> Payment</div>
            <div className="det-val">{apt.payment_method === 'medical_aid' ? 'Medical Aid' : 'Cash'}</div>
          </div>
          {apt.payment_method === 'medical_aid' && (
            <>
              <div className="det-field">
                <div className="det-lbl"><CreditCard size={10} /> Medical Aid</div>
                <div className="det-val">{apt.medical_aid || '—'}</div>
              </div>
              <div className="det-field">
                <div className="det-lbl"><CreditCard size={10} /> Membership No.</div>
                <div className="det-val">{apt.membership_number || '—'}</div>
              </div>
            </>
          )}
          {apt.reason && (
            <div className="det-field">
              <div className="det-lbl"><MessageCircle size={10} /> Reason</div>
              <div className="det-val">{apt.reason}</div>
            </div>
          )}
          <div className="det-field">
            <div className="det-lbl">
              {apt.source === 'website' ? <Globe size={10} /> : <MessageCircle size={10} />} Source
            </div>
            <div className="det-val">{apt.source === 'website' ? 'Website booking' : 'WhatsApp booking'}</div>
          </div>
          <div className="det-field">
            <div className="det-lbl"><Clock size={10} /> Submitted</div>
            <div className="det-val">{fmtTs(apt.created_at)}</div>
          </div>
        </div>
        {apt.status === 'pending_approval' && (
          <div className="det-actions">
            <button className="btn-a" style={{ flex: 1 }} disabled={loading}
              onClick={() => { onApprove(); onClose(); }}>
              {loading ? <Loader2 size={13} className="spinner" /> : <Check size={13} />}
              {!loading && 'Approve'}
            </button>
            <button className="btn-r" style={{ flex: 1 }} disabled={loading}
              onClick={() => { onReject(); onClose(); }}>
              {loading ? <Loader2 size={13} className="spinner" /> : <X size={13} />}
              {!loading && 'Reject'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

const FILTERS = [
  { key: 'all',              label: 'All' },
  { key: 'pending_approval', label: 'Pending' },
  { key: 'confirmed',        label: 'Confirmed' },
  { key: 'rejected',         label: 'Rejected' },
];

export default function DoctorDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [filter, setFilter]             = useState('all');
  const [search, setSearch]             = useState('');
  const [actionLoading, setActionLoading] = useState({});
  const [autoPilot, setAutoPilot]       = useState(() => localStorage.getItem('autopilot') === 'true');
  const autoProcessed                   = useRef(new Set());
  const [detail, setDetail]             = useState(null);
  const [banner, setBanner]             = useState(null);
  const bannerTimer                     = useRef(null);

  const showBanner = useCallback(msg => {
    setBanner(msg);
    clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), 2200);
  }, []);

  useEffect(() => { localStorage.setItem('autopilot', autoPilot); }, [autoPilot]);

  useEffect(() => {
    if (!autoPilot || appointments.length === 0) return;
    appointments.filter(a => a.status === 'pending_approval').forEach((apt, i) => {
      if (autoProcessed.current.has(apt.id)) return;
      autoProcessed.current.add(apt.id);
      const conflict = appointments.some(a => a.id !== apt.id && a.date === apt.date && a.time === apt.time && a.status === 'confirmed');
      setTimeout(() => act(apt.id, !conflict), i * 600);
    });
  }, [appointments, autoPilot]);

  useEffect(() => {
    if (!AUTH_TOKEN) { setError('REACT_APP_DOCTOR_TOKEN not set'); setLoading(false); return; }
    const q = query(collection(db, 'appointments'), orderBy('created_at', 'desc'));
    return onSnapshot(q,
      snap => { setAppointments(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); },
      ()   => { setError('Failed to load appointments'); setLoading(false); }
    );
  }, []);

  const act = async (id, confirm) => {
    setActionLoading(s => ({ ...s, [id]: true }));
    try {
      await axios.post(`${API_BASE}/confirm-appointment`,
        { appointmentId: id, confirm, doctorName: 'Dr. SG Majeke' },
        { headers: { Authorization: `Bearer ${AUTH_TOKEN}`, 'Content-Type': 'application/json' } }
      );
      showBanner(confirm ? 'Appointment approved' : 'Appointment rejected');
    } catch (e) {
      showBanner(e.response?.data?.error || 'Action failed');
    } finally {
      setActionLoading(s => ({ ...s, [id]: false }));
    }
  };

  const counts = {
    all:              appointments.length,
    pending_approval: appointments.filter(a => a.status === 'pending_approval').length,
    confirmed:        appointments.filter(a => a.status === 'confirmed').length,
    rejected:         appointments.filter(a => a.status === 'rejected').length,
  };

  const filtered = appointments
    .filter(a => filter === 'all' || a.status === filter)
    .filter(a => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (a.patient_name || '').toLowerCase().includes(q) || (a.phone || '').includes(q);
    });

  const todayFull = new Date().toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  if (loading) return (
    <>
      <style>{CSS}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f3f4f6' }}>
        <Loader2 size={28} color="#2563eb" className="spinner" />
      </div>
    </>
  );

  if (error) return (
    <>
      <style>{CSS}</style>
      <div style={{ padding: 24, color: '#b91c1c', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
        <AlertCircle size={16} /> {error}
      </div>
    </>
  );

  return (
    <>
      <style>{CSS}</style>

      <div className="wrap">

        {/* Header */}
        <header className="hdr">
          <div className="hdr-brand">
            <Stethoscope size={18} className="hdr-icon" />
            <span className="hdr-name">Dr. SG Majeke</span>
            <span className="hdr-sep">·</span>
            <span className="hdr-sub">General Practitioner</span>
          </div>
          <div className="hdr-right">
            <span className="hdr-date">{todayFull}</span>
            <button className={`ap-btn${autoPilot ? ' on' : ''}`}
              onClick={() => { if (!autoPilot) autoProcessed.current.clear(); setAutoPilot(p => !p); }}>
              <span className="ap-dot" />
              Auto {autoPilot ? 'On' : 'Off'}
            </button>
          </div>
        </header>

        {/* Toolbar */}
        <div className="toolbar">
          <div className="search-wrap">
            <Search size={13} className="search-icon" />
            <input className="search-input" type="search" placeholder="Search name or phone…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="filter-pills">
            {FILTERS.map(f => (
              <button key={f.key} className={`pill${filter === f.key ? ' active' : ''}`}
                onClick={() => setFilter(f.key)}>
                {f.label}
                {counts[f.key] > 0 && <span className="pill-count">{counts[f.key]}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="table-area">
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Payment</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr className="empty-row">
                    <td colSpan={7}>No appointments found</td>
                  </tr>
                )}
                {filtered.map(apt => (
                  <tr key={apt.id} onClick={() => setDetail(apt)}>
                    <td>
                      <div className="td-name">{apt.patient_name || 'Unknown'}</div>
                      <div className="td-phone"><Phone size={10} />{apt.phone}</div>
                    </td>
                    <td>
                      <div className="td-date">{fmtDateShort(apt.date)}</div>
                    </td>
                    <td>
                      <div className="td-time"><Clock size={11} />{apt.time}</div>
                    </td>
                    <td>
                      {apt.payment_method === 'medical_aid' ? (
                        <>
                          <div className="td-pay">{apt.medical_aid || 'Medical Aid'}</div>
                          {apt.membership_number && <div className="td-pay-sub">#{apt.membership_number}</div>}
                        </>
                      ) : (
                        <div className="td-pay">Cash</div>
                      )}
                    </td>
                    <td>
                      {apt.source === 'website'
                        ? <span className="src-badge src-web"><Globe size={10} /> Web</span>
                        : <span className="src-badge src-wa"><MessageCircle size={10} /> WhatsApp</span>}
                    </td>
                    <td><StatusBadge status={apt.status} /></td>
                    <td onClick={e => e.stopPropagation()}>
                      {apt.status === 'pending_approval' ? (
                        <div className="action-cell">
                          <button className="btn-a" disabled={!!actionLoading[apt.id]} onClick={() => act(apt.id, true)}>
                            {actionLoading[apt.id] ? <Loader2 size={12} className="spinner" /> : <Check size={12} />}
                            Approve
                          </button>
                          <button className="btn-r" disabled={!!actionLoading[apt.id]} onClick={() => act(apt.id, false)}>
                            {actionLoading[apt.id] ? <Loader2 size={12} className="spinner" /> : <X size={12} />}
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: '#d1d5db', fontSize: 13 }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="mobile-list">
            {filtered.length === 0 && (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: '#d1d5db', fontSize: 13, background: '#fff' }}>
                No appointments found
              </div>
            )}
            {filtered.map(apt => (
              <div className="m-card" key={apt.id} onClick={() => setDetail(apt)}>
                <div className="m-card-body">
                  <div className="m-card-name">{apt.patient_name || 'Unknown'}</div>
                  <div className="m-card-meta">
                    <span className="m-card-meta-item"><CalendarDays size={11} />{fmtDateShort(apt.date)}</span>
                    <span className="m-card-meta-item"><Clock size={11} />{apt.time}</span>
                    <span className="m-card-meta-item"><Phone size={11} />{apt.phone}</span>
                    <span className="m-card-meta-item">
                      <CreditCard size={11} />
                      {apt.payment_method === 'medical_aid' ? apt.medical_aid || 'Medical Aid' : 'Cash'}
                    </span>
                  </div>
                  {apt.status === 'pending_approval' && (
                    <div className="m-card-actions" onClick={e => e.stopPropagation()}>
                      <button className="btn-a" disabled={!!actionLoading[apt.id]} onClick={() => act(apt.id, true)}>
                        <Check size={12} /> Approve
                      </button>
                      <button className="btn-r" disabled={!!actionLoading[apt.id]} onClick={() => act(apt.id, false)}>
                        <X size={12} /> Reject
                      </button>
                    </div>
                  )}
                </div>
                <div className="m-card-right">
                  <StatusBadge status={apt.status} />
                  {apt.source === 'website'
                    ? <span className="src-badge src-web"><Globe size={10} /> Web</span>
                    : <span className="src-badge src-wa"><MessageCircle size={10} /> WA</span>}
                </div>
              </div>
            ))}
          </div>

          <div className="tbl-footer">
            {filtered.length} of {appointments.length} appointments
          </div>
        </div>

      </div>

      {detail && (
        <DetailPane
          apt={detail}
          loading={!!actionLoading[detail.id]}
          onApprove={() => act(detail.id, true)}
          onReject={() => act(detail.id, false)}
          onClose={() => setDetail(null)}
        />
      )}

      {banner && <div className="banner">{banner}</div>}
    </>
  );
}
