import React, { useEffect, useState } from 'react';
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
    return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
};

const statusMap = {
  pending_approval: { label: 'Pending',   bg: '#fffbeb', color: '#d97706', border: '#fcd34d' },
  confirmed:        { label: 'Confirmed', bg: '#f0fdf4',  color: '#16a34a', border: '#86efac' },
  rejected:         { label: 'Rejected',  bg: '#fef2f2',  color: '#dc2626', border: '#fca5a5' },
};

const StatusBadge = ({ status }) => {
  const s = statusMap[status] || { label: status, bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' };
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
};

const SourceBadge = ({ source }) => (
  source === 'website'
    ? <span style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>Website</span>
    : <span style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>WhatsApp</span>
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
  const [now, setNow]                     = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

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

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #f8fafc; font-family: 'Inter', system-ui, sans-serif; color: #334155; }

    .dash { display: flex; flex-direction: column; min-height: 100vh; }

    .topbar {
      background: #fff;
      border-bottom: 1px solid #e2e8f0;
      padding: 0 28px;
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 40;
    }
    .topbar-left  { display: flex; align-items: center; gap: 10px; }
    .topbar-right { display: flex; align-items: center; gap: 20px; }

    .nav { display: flex; gap: 2px; }
    .nav-btn {
      background: none; border: none;
      padding: 6px 14px; border-radius: 6px;
      font-size: 13px; font-weight: 500;
      color: #64748b; cursor: pointer;
      transition: background .15s, color .15s;
      white-space: nowrap;
    }
    .nav-btn:hover  { background: #f1f5f9; color: #0f172a; }
    .nav-btn.active { background: #fff7ed; color: #ea580c; font-weight: 600; }

    .body { display: flex; flex: 1; overflow: hidden; }

    .main { flex: 1; overflow-y: auto; padding: 24px 28px; }

    .sidebar {
      width: 300px;
      min-width: 300px;
      border-left: 1px solid #e2e8f0;
      background: #fff;
      overflow-y: auto;
      padding: 20px;
    }

    .cal-grid { display: grid; grid-template-columns: repeat(7,1fr); gap: 2px; }
    .cal-head { font-size: 10px; font-weight: 700; color: #94a3b8; text-align: center; padding: 6px 0; text-transform: uppercase; letter-spacing: .5px; }
    .cal-cell {
      border-radius: 8px;
      min-height: 72px;
      padding: 6px;
      cursor: pointer;
      transition: background .12s;
      position: relative;
      border: 1px solid transparent;
    }
    .cal-cell:hover    { background: #f8fafc; border-color: #e2e8f0; }
    .cal-cell.today    { background: #fff7ed; border-color: #fdba74; }
    .cal-cell.selected { background: #fff7ed; border-color: #ea580c; }
    .cal-cell.has-apts { }
    .cal-day { font-size: 12px; font-weight: 500; color: #475569; margin-bottom: 4px; }
    .cal-cell.today .cal-day    { color: #ea580c; font-weight: 700; }
    .cal-cell.selected .cal-day { color: #ea580c; font-weight: 700; }

    .dot-row { display: flex; flex-wrap: wrap; gap: 2px; }
    .dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

    .apt-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 10px;
      background: #fff;
    }
    .apt-card:last-child { margin-bottom: 0; }

    .divider { height: 1px; background: #f1f5f9; margin: 12px 0; }

    .action-row { display: flex; gap: 8px; margin-top: 12px; }
    .btn-approve { background: #16a34a; color: #fff; border: none; border-radius: 6px; padding: '7px 16px'; font-size: 12px; font-weight: 600; cursor: pointer; flex: 1; padding: 7px 0; }
    .btn-approve:disabled { opacity: .5; cursor: not-allowed; }
    .btn-reject  { background: #fff; color: #dc2626; border: 1px solid #dc2626; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; flex: 1; padding: 7px 0; }
    .btn-reject:disabled  { opacity: .5; cursor: not-allowed; }

    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 560px; }
    th { padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: .5px; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
    td { padding: 12px 14px; border-bottom: 1px solid #f1f5f9; color: #334155; vertical-align: middle; }
    tr:hover td { background: #f8fafc; }
    tr:last-child td { border-bottom: none; }

    input[type="search"] { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 12px; font-size: 13px; color: #334155; width: 220px; }
    input[type="search"]:focus { outline: 2px solid #ea580c; outline-offset: 1px; }

    .filter-pill { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 20px; padding: 4px 14px; font-size: 12px; font-weight: 500; color: #64748b; cursor: pointer; white-space: nowrap; }
    .filter-pill.active { background: #ea580c; border-color: #ea580c; color: #fff; font-weight: 600; }

    .pending-badge { background: #fffbeb; color: #d97706; border: 1px solid #fcd34d; border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 700; }

    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner { width: 28px; height: 28px; border: 3px solid #e2e8f0; border-top-color: #ea580c; border-radius: 50%; animation: spin 1s linear infinite; }

    @media (max-width: 900px) {
      .sidebar { display: none; }
      .main { padding: 16px; }
      .topbar { padding: 0 16px; }
    }
    @media (max-width: 640px) {
      .topbar-right .header-date { display: none; }
      input[type="search"] { width: 140px; }
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
      <div style={{ padding: 32, color: '#dc2626', fontSize: 14 }}>{error}</div>
    </>
  );

  const weeks     = buildCal();
  const monthStr  = month.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
  const dayApts   = forDay(selectedDay);

  return (
    <>
      <style>{css}</style>
      <div className="dash">

        <header className="topbar">
          <div className="topbar-left">
            <img src="/logo.png" alt="Dr. SG Majeke" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>Dr. SG Majeke</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>General Practitioner · Mt Frere</div>
            </div>
          </div>

          <nav className="nav">
            {[
              { key: 'calendar',  label: 'Calendar' },
              { key: 'bookings',  label: 'Bookings' },
              { key: 'pending',   label: pending.length ? `Pending (${pending.length})` : 'Pending' },
            ].map(t => (
              <button key={t.key} className={`nav-btn${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </nav>

          <div className="topbar-right">
            {pending.length > 0 && (
              <span className="pending-badge">{pending.length} pending</span>
            )}
            <div className="header-date" style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
                {now.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                {now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        </header>

        <div className="body">
          <main className="main">

            {tab === 'calendar' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{monthStr}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1))}
                      style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 14px', fontSize: 13, cursor: 'pointer', color: '#334155' }}>
                      ←
                    </button>
                    <button type="button" onClick={() => { setMonth(new Date()); setSelectedDay(today); }}
                      style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 14px', fontSize: 12, cursor: 'pointer', color: '#64748b' }}>
                      Today
                    </button>
                    <button type="button" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1))}
                      style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 14px', fontSize: 13, cursor: 'pointer', color: '#334155' }}>
                      →
                    </button>
                  </div>
                </div>

                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16 }}>
                  <div className="cal-grid" style={{ marginBottom: 4 }}>
                    {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                      <div key={d} className="cal-head">{d}</div>
                    ))}
                  </div>
                  <div className="cal-grid">
                    {weeks.flatMap((wk, wi) => wk.map((cell, di) => {
                      if (!cell) return <div key={`e-${wi}-${di}`} />;
                      const apts      = forDay(cell.ds);
                      const isToday   = cell.ds === today;
                      const isSel     = cell.ds === selectedDay;
                      const confirmed = apts.filter(a => a.status === 'confirmed');
                      const pend      = apts.filter(a => a.status === 'pending_approval');
                      return (
                        <div key={cell.ds}
                          className={`cal-cell${isToday ? ' today' : ''}${isSel ? ' selected' : ''}`}
                          onClick={() => setSelectedDay(cell.ds)}>
                          <div className="cal-day">{cell.day}</div>
                          <div className="dot-row">
                            {confirmed.slice(0, 4).map((_, i) => <div key={i} className="dot" style={{ background: '#16a34a' }} />)}
                            {pend.slice(0, 4).map((_, i)      => <div key={i} className="dot" style={{ background: '#d97706' }} />)}
                          </div>
                          {apts.length > 0 && (
                            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{apts.length} apt{apts.length !== 1 ? 's' : ''}</div>
                          )}
                        </div>
                      );
                    }))}
                  </div>

                  <div style={{ display: 'flex', gap: 16, marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                    {[['#16a34a', 'Confirmed'], ['#d97706', 'Pending']].map(([c, l]) => (
                      <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748b' }}>
                        <div className="dot" style={{ background: c }} />
                        {l}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {tab === 'bookings' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                  <input type="search" placeholder="Search name or phone…" value={search} onChange={e => setSearch(e.target.value)} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[['all','All'],['pending_approval','Pending'],['confirmed','Confirmed'],['rejected','Rejected']].map(([k, l]) => (
                      <button type="button" key={k} className={`filter-pill${filterStatus === k ? ' active' : ''}`} onClick={() => setFilterStatus(k)}>{l}</button>
                    ))}
                  </div>
                </div>

                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
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
                          <tr><td colSpan={7} style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>No appointments found</td></tr>
                        )}
                        {filtered.map(apt => (
                          <tr key={apt.id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Avatar name={apt.patient_name} size={30} />
                                <span style={{ fontWeight: 600, color: '#0f172a' }}>{apt.patient_name || 'Unknown'}</span>
                              </div>
                            </td>
                            <td style={{ color: '#64748b' }}>{apt.phone}</td>
                            <td>
                              <div style={{ fontWeight: 500 }}>{fmtDate(apt.date)}</div>
                              <div style={{ fontWeight: 700, color: '#ea580c', fontSize: 12 }}>{apt.time}</div>
                            </td>
                            <td>
                              {apt.payment_method === 'medical_aid'
                                ? <div><div style={{ fontWeight: 600 }}>{apt.medical_aid}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>#{apt.membership_number}</div></div>
                                : <span style={{ color: '#16a34a', fontWeight: 600 }}>Cash</span>}
                            </td>
                            <td><SourceBadge source={apt.source} /></td>
                            <td><StatusBadge status={apt.status} /></td>
                            <td>
                              {apt.status === 'pending_approval' && (
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button type="button" className="btn-approve" disabled={actionLoading[apt.id]} onClick={() => handleAction(apt.id, true)}>
                                    {actionLoading[apt.id] ? '…' : 'Approve'}
                                  </button>
                                  <button type="button" className="btn-reject" disabled={actionLoading[apt.id]} onClick={() => handleAction(apt.id, false)}>
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
                  <div style={{ padding: '10px 16px', borderTop: '1px solid #f1f5f9', fontSize: 12, color: '#94a3b8' }}>
                    {filtered.length} of {appointments.length} appointments
                  </div>
                </div>
              </>
            )}

            {tab === 'pending' && (
              <>
                {pending.length === 0 ? (
                  <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '64px 32px', textAlign: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#16a34a', marginBottom: 6 }}>No pending approvals</div>
                    <p style={{ fontSize: 13, color: '#94a3b8' }}>All bookings are up to date</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                    {pending.map(apt => (
                      <div key={apt.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', borderTop: '3px solid #d97706', overflow: 'hidden' }}>
                        <div style={{ padding: 18 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                            <Avatar name={apt.patient_name} size={38} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{apt.patient_name || 'Unknown'}</div>
                              <div style={{ fontSize: 12, color: '#64748b' }}>{apt.phone}</div>
                            </div>
                            <SourceBadge source={apt.source} />
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
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

                          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Submitted {fmtTs(apt.created_at)}</div>
                          {actionError[apt.id] && <p style={{ color: '#dc2626', fontSize: 12 }}>{actionError[apt.id]}</p>}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid #f1f5f9' }}>
                          <button type="button" className="btn-approve" disabled={actionLoading[apt.id]} onClick={() => handleAction(apt.id, true)}
                            style={{ borderRadius: '0 0 0 11px', padding: '12px 0' }}>
                            {actionLoading[apt.id] ? '…' : 'Approve'}
                          </button>
                          <button type="button" className="btn-reject" disabled={actionLoading[apt.id]} onClick={() => handleAction(apt.id, false)}
                            style={{ borderRadius: '0 0 11px 0', padding: '12px 0', borderLeft: '1px solid #f1f5f9', borderTop: 'none', borderRight: 'none', borderBottom: 'none' }}>
                            {actionLoading[apt.id] ? '…' : 'Reject'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

          </main>

          <aside className="sidebar">
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>
                {selectedDay === today ? 'Today' : fmtDateLong(selectedDay)}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                {dayApts.length === 0 ? 'No appointments' : `${dayApts.length} appointment${dayApts.length !== 1 ? 's' : ''}`}
              </div>
            </div>

            {dayApts.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#cbd5e1', fontSize: 13 }}>
                Nothing scheduled
              </div>
            )}

            {dayApts.map((apt, i) => (
              <div key={apt.id}>
                {i > 0 && <div className="divider" />}
                <div className="apt-card" style={{ borderLeft: `3px solid ${apt.status === 'confirmed' ? '#16a34a' : apt.status === 'rejected' ? '#dc2626' : '#d97706'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Avatar name={apt.patient_name} size={30} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{apt.patient_name || 'Unknown'}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{apt.phone}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#ea580c' }}>{apt.time}</span>
                    <StatusBadge status={apt.status} />
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: apt.status === 'pending_approval' ? 8 : 0 }}>
                    {apt.payment_method === 'medical_aid' ? `${apt.medical_aid}` : 'Cash'} · <SourceBadge source={apt.source} />
                  </div>
                  {apt.status === 'pending_approval' && (
                    <div className="action-row">
                      <button type="button" className="btn-approve" disabled={actionLoading[apt.id]} onClick={() => handleAction(apt.id, true)}>
                        {actionLoading[apt.id] ? '…' : 'Approve'}
                      </button>
                      <button type="button" className="btn-reject" disabled={actionLoading[apt.id]} onClick={() => handleAction(apt.id, false)}>
                        {actionLoading[apt.id] ? '…' : 'Reject'}
                      </button>
                    </div>
                  )}
                  {actionError[apt.id] && <p style={{ color: '#dc2626', fontSize: 11, marginTop: 6 }}>{actionError[apt.id]}</p>}
                </div>
              </div>
            ))}
          </aside>
        </div>

      </div>
    </>
  );
}
