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

const P = {
  orange: '#ea580c', orangeLight: '#fff7ed',
  slate900: '#0f172a', slate700: '#334155', slate600: '#475569',
  slate500: '#64748b', slate400: '#94a3b8', slate200: '#e2e8f0',
  slate100: '#f1f5f9', slate50: '#f8fafc',
  green: '#16a34a', greenLight: '#f0fdf4',
  red: '#dc2626', redLight: '#fef2f2',
  amber: '#d97706', amberLight: '#fffbeb',
  blue: '#2563eb', blueLight: '#eff6ff',
};

const statusMap = {
  pending_approval: { label: 'Pending',   bg: P.amberLight, color: P.amber },
  confirmed:        { label: 'Confirmed', bg: P.greenLight,  color: P.green },
  rejected:         { label: 'Rejected',  bg: P.redLight,    color: P.red },
};

const Tag = ({ children, bg, color }) => (
  <span style={{ background: bg, color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{children}</span>
);
const StatusTag = ({ status }) => {
  const s = statusMap[status] || { label: status, bg: P.slate100, color: P.slate500 };
  return <Tag bg={s.bg} color={s.color}>{s.label}</Tag>;
};
const SourceTag = ({ source }) => (
  source === 'website'
    ? <Tag bg={P.blueLight}  color={P.blue}>Website</Tag>
    : <Tag bg={P.greenLight} color={P.green}>WhatsApp</Tag>
);

const Initials = ({ name, size = 36 }) => {
  const chars = (name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const hue   = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: `hsl(${hue},45%,52%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: size * 0.36, flexShrink: 0, letterSpacing: '0.5px' }}>
      {chars}
    </div>
  );
};

const Divider = () => <div style={{ height: 1, background: P.slate100, margin: '0 -24px' }} />;

const Card = ({ children, style = {} }) => (
  <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.slate200}`, ...style }}>
    {children}
  </div>
);

const SectionTitle = ({ children }) => (
  <p style={{ fontSize: 11, fontWeight: 700, color: P.slate500, textTransform: 'uppercase', letterSpacing: '0.8px', margin: '0 0 16px' }}>{children}</p>
);

const ActionBtn = ({ variant, disabled, onClick, children }) => {
  const styles = {
    approve: { background: P.green, color: '#fff', border: 'none' },
    reject:  { background: '#fff', color: P.red, border: `1px solid ${P.red}` },
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{ borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .5 : 1, transition: 'opacity .15s', ...styles[variant] }}>
      {children}
    </button>
  );
};

export default function DoctorDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [tab, setTab]                   = useState('overview');
  const [filterStatus, setFilterStatus]   = useState('all');
  const [filterSource, setFilterSource]   = useState('all');
  const [filterPayment, setFilterPayment] = useState('all');
  const [filterFrom, setFilterFrom]       = useState('');
  const [filterTo, setFilterTo]           = useState('');
  const [search, setSearch]               = useState('');
  const [actionLoading, setActionLoading] = useState({});
  const [actionError, setActionError]     = useState({});
  const [autoPilot, setAutoPilot]         = useState(() => localStorage.getItem('autopilot') === 'true');
  const autoProcessedRef = React.useRef(new Set());
  const [selectedDay, setSelectedDay]     = useState(null);
  const [month, setMonth]                 = useState(new Date());
  const [sortField, setSortField]         = useState('date');
  const [sortDir, setSortDir]             = useState('asc');
  const [now, setNow]                     = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    localStorage.setItem('autopilot', autoPilot);
  }, [autoPilot]);

  useEffect(() => {
    if (!autoPilot || appointments.length === 0) return;
    const pending = appointments.filter(a => a.status === 'pending_approval');
    pending.forEach((apt, idx) => {
      if (autoProcessedRef.current.has(apt.id)) return;
      autoProcessedRef.current.add(apt.id);
      // Stagger each action 800ms apart to avoid race conditions
      setTimeout(() => {
        const conflict = appointments.some(
          a => a.id !== apt.id &&
               a.date === apt.date &&
               a.time === apt.time &&
               a.status === 'confirmed'
        );
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
        { appointmentId: id, confirm, doctorName: 'Dr. S Mtika' },
        { headers: { Authorization: `Bearer ${AUTH_TOKEN}`, 'Content-Type': 'application/json' } }
      );
    } catch (e) {
      setActionError(s => ({ ...s, [id]: e.response?.data?.error || e.message }));
    } finally {
      setActionLoading(s => ({ ...s, [id]: false }));
    }
  };

  const today = now.toISOString().split('T')[0];
  const stats = {
    total:     appointments.length,
    pending:   appointments.filter(a => a.status === 'pending_approval').length,
    confirmed: appointments.filter(a => a.status === 'confirmed').length,
    rejected:  appointments.filter(a => a.status === 'rejected').length,
    today:     appointments.filter(a => a.date === today).length,
  };

  const forDay   = d => appointments.filter(a => a.date === d);
  const hasClash = d => { const t = forDay(d).filter(a => a.status !== 'rejected').map(a => a.time); return t.length !== new Set(t).size; };
  const pending  = appointments.filter(a => a.status === 'pending_approval').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  const activeFilters = [filterStatus, filterSource, filterPayment, filterFrom, filterTo].filter(f => f && f !== 'all').length;

  const filtered = appointments
    .filter(a => filterStatus === 'all' || a.status === filterStatus)
    .filter(a => filterSource === 'all' || (filterSource === 'website' ? a.source === 'website' : !a.source || a.source === 'whatsapp'))
    .filter(a => filterPayment === 'all' || (filterPayment === 'medical_aid' ? a.payment_method === 'medical_aid' : a.payment_method !== 'medical_aid'))
    .filter(a => !filterFrom || a.date >= filterFrom)
    .filter(a => !filterTo   || a.date <= filterTo)
    .filter(a => !search || (a.patient_name || '').toLowerCase().includes(search.toLowerCase()) || (a.phone || '').includes(search))
    .sort((a, b) => {
      const va = sortField === 'date' ? a.date + a.time : (a[sortField] || '');
      const vb = sortField === 'date' ? b.date + b.time : (b[sortField] || '');
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });

  const clearFilters = () => { setFilterStatus('all'); setFilterSource('all'); setFilterPayment('all'); setFilterFrom(''); setFilterTo(''); setSearch(''); };
  const toggleSort = f => { if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortField(f); setSortDir('asc'); } };

  const buildCal = () => {
    const yr = month.getFullYear(), mo = month.getMonth();
    const first = new Date(yr, mo, 1).getDay(), days = new Date(yr, mo + 1, 0).getDate();
    const weeks = []; let d = 1 - first;
    for (let w = 0; w < 6; w++) {
      const wk = [];
      for (let i = 0; i < 7; i++, d++) {
        if (d < 1 || d > days) { wk.push(null); continue; }
        const dateStr = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        wk.push({ day: d, dateStr });
      }
      weeks.push(wk);
      if (d > days) break;
    }
    return weeks;
  };
  const weeks    = buildCal();
  const monthStr = month.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: ${P.slate50}; font-family: 'Inter', system-ui, sans-serif; color: ${P.slate700}; }

    .dash-header {
      background: #fff; border-bottom: 1px solid ${P.slate200};
      padding: 0 32px; display: flex; align-items: center;
      justify-content: space-between; min-height: 60px;
      position: sticky; top: 0; z-index: 50; gap: 12px; flex-wrap: wrap;
    }
    .dash-header-left  { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
    .dash-header-right { display: flex; align-items: center; gap: 16px; flex-shrink: 0; }
    .header-time { text-align: right; }

    .main-pad { padding: 28px 32px; max-width: 1320px; margin: 0 auto; }

    .stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 28px; }

    .tabs-row { display: flex; border-bottom: 1px solid ${P.slate200}; margin-bottom: 24px; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
    .tabs-row::-webkit-scrollbar { display: none; }

    .tab-btn { background: none; border: none; padding: 10px 16px; font-size: 13px; font-weight: 500; color: ${P.slate500}; border-bottom: 2px solid transparent; cursor: pointer; transition: color .15s, border-color .15s; white-space: nowrap; flex-shrink: 0; }
    .tab-btn:hover { color: ${P.slate900}; }
    .tab-btn.active { color: ${P.orange}; border-bottom-color: ${P.orange}; font-weight: 600; }

    .layout-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .layout-cal { display: grid; grid-template-columns: 1fr 340px; gap: 20px; }
    .span-full { grid-column: 1 / -1; }

    .filter-btn { background: #fff; border: 1px solid ${P.slate200}; border-radius: 6px; padding: 5px 12px; font-size: 12px; font-weight: 500; color: ${P.slate500}; cursor: pointer; transition: all .15s; white-space: nowrap; }
    .filter-btn:hover { border-color: ${P.orange}; color: ${P.orange}; }
    .filter-btn.active { background: ${P.orange}; border-color: ${P.orange}; color: #fff; font-weight: 600; }

    .row-hover:hover { background: ${P.slate50}; }

    .cal-cell { border: 1px solid ${P.slate200}; border-radius: 8px; padding: 6px; cursor: pointer; min-height: 64px; vertical-align: top; transition: border-color .15s, background .15s; }
    .cal-cell:hover { border-color: ${P.orange}; background: ${P.orangeLight}; }
    .cal-cell.is-today { background: ${P.orangeLight}; border-color: ${P.orange}; }
    .cal-cell.is-selected { background: ${P.blueLight}; border-color: ${P.blue}; }

    .th-sort { background: none; border: none; font-size: 11px; font-weight: 600; color: ${P.slate500}; text-transform: uppercase; letter-spacing: .6px; cursor: pointer; padding: 0; white-space: nowrap; }
    .th-sort:hover { color: ${P.orange}; }

    .hide-mobile { }

    .autopilot-btn { display: flex; align-items: center; gap: 6px; border: none; border-radius: 8px; padding: 6px 14px; font-size: 12px; font-weight: 700; cursor: pointer; transition: all .2s; letter-spacing: .3px; }
    .autopilot-btn.on  { background: ${P.green};    color: #fff; box-shadow: 0 0 0 3px ${P.greenLight}; }
    .autopilot-btn.off { background: ${P.slate100}; color: ${P.slate600}; }
    .autopilot-btn.on .ap-dot  { width: 7px; height: 7px; border-radius: 50%; background: #fff; animation: pulse 1.4s infinite; }
    .autopilot-btn.off .ap-dot { width: 7px; height: 7px; border-radius: 50%; background: ${P.slate400}; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }

    input:focus { outline: 2px solid ${P.orange}; outline-offset: 1px; }
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-thumb { background: ${P.slate200}; border-radius: 4px; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Tablet */
    @media (max-width: 1024px) {
      .stats-grid { grid-template-columns: repeat(3, 1fr); }
      .layout-cal { grid-template-columns: 1fr; }
    }

    /* Mobile */
    @media (max-width: 640px) {
      .dash-header { padding: 10px 16px; }
      .header-time { display: none; }
      .main-pad { padding: 16px; }
      .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 16px; }
      .layout-2 { grid-template-columns: 1fr; }
      .layout-cal { grid-template-columns: 1fr; }
      .hide-mobile { display: none; }
      .tab-btn { padding: 10px 12px; font-size: 12px; }
    }
  `;

  if (loading) return (
    <>
      <style>{css}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 32, height: 32, border: `3px solid ${P.slate200}`, borderTopColor: P.orange, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ color: P.slate500, fontSize: 14 }}>Loading…</p>
        </div>
      </div>
    </>
  );
  if (error) return <><style>{css}</style><div style={{ padding: 32, color: P.red, fontSize: 14 }}>{error}</div></>;

  return (
    <>
      <style>{css}</style>
      <div style={{ minHeight: '100vh', background: P.slate50 }}>

        <header className="dash-header">
          <div className="dash-header-left">
            <img src="/logo.png" alt="Dr. S Mtika" style={{ width: 36, height: 36, objectFit: 'contain', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: P.slate900, lineHeight: 1.2 }}>Dr. S Mtika</div>
              <div style={{ fontSize: 11, color: P.slate500 }}>Booking Management</div>
            </div>
          </div>
          <div className="dash-header-right">
            <button
              type="button"
              className={`autopilot-btn ${autoPilot ? 'on' : 'off'}`}
              onClick={() => {
                if (!autoPilot) autoProcessedRef.current.clear();
                setAutoPilot(p => !p);
              }}
              title={autoPilot ? 'Auto Pilot is ON — click to disable' : 'Enable Auto Pilot to auto-approve bookings'}
            >
              <span className="ap-dot" />
              Auto Pilot {autoPilot ? 'ON' : 'OFF'}
            </button>
            {stats.pending > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: P.amberLight, border: `1px solid #fcd34d`, borderRadius: 6, padding: '4px 10px' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: P.amber }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: P.amber }}>{stats.pending} pending</span>
              </div>
            )}
            <div className="header-time">
              <div style={{ fontSize: 13, fontWeight: 600, color: P.slate700 }}>
                {now.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}
              </div>
              <div style={{ fontSize: 11, color: P.slate500 }}>
                {now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        </header>

        <div className="main-pad">

          <div className="stats-grid">
            {[
              { label: 'Total',     value: stats.total,     accent: P.blue },
              { label: 'Pending',   value: stats.pending,   accent: P.amber },
              { label: 'Confirmed', value: stats.confirmed, accent: P.green },
              { label: 'Rejected',  value: stats.rejected,  accent: P.red },
              { label: 'Today',     value: stats.today,     accent: P.orange },
            ].map(s => (
              <Card key={s.label} style={{ padding: '16px 18px', borderTop: `3px solid ${s.accent}` }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: P.slate900, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: P.slate500, marginTop: 4, fontWeight: 500 }}>{s.label}</div>
              </Card>
            ))}
          </div>

          <div className="tabs-row">
            {[
              { key: 'overview', label: 'Overview' },
              { key: 'calendar', label: 'Calendar' },
              { key: 'table',    label: 'All Bookings' },
              { key: 'pending',  label: `Pending${stats.pending ? ` (${stats.pending})` : ''}` },
            ].map(t => (
              <button key={t.key} className={`tab-btn ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="layout-2">

              <Card style={{ padding: 24 }}>
                <SectionTitle>Today — {now.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' })}</SectionTitle>
                {forDay(today).length === 0
                  ? <p style={{ color: P.slate500, fontSize: 14, padding: '24px 0', textAlign: 'center' }}>No appointments today</p>
                  : forDay(today).sort((a, b) => a.time?.localeCompare(b.time)).map((apt, i) => (
                    <div key={apt.id}>
                      {i > 0 && <Divider />}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0' }}>
                        <Initials name={apt.patient_name} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: P.slate900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{apt.patient_name || 'Unknown'}</div>
                          <div style={{ fontSize: 12, color: P.slate500 }}>{apt.phone}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 15, color: P.orange }}>{apt.time}</div>
                          <StatusTag status={apt.status} />
                        </div>
                      </div>
                    </div>
                  ))}
              </Card>

              <Card style={{ padding: 24 }}>
                <SectionTitle>Needs Approval</SectionTitle>
                {pending.length === 0
                  ? <p style={{ color: P.slate500, fontSize: 14, padding: '24px 0', textAlign: 'center' }}>No pending approvals</p>
                  : pending.slice(0, 5).map((apt, i) => (
                    <div key={apt.id}>
                      {i > 0 && <Divider />}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0' }}>
                        <Initials name={apt.patient_name} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: P.slate900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{apt.patient_name || 'Unknown'}</div>
                          <div style={{ fontSize: 12, color: P.slate500 }}>{apt.date} · {apt.time}</div>
                          <SourceTag source={apt.source} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                          <ActionBtn variant="approve" disabled={actionLoading[apt.id]} onClick={() => handleAction(apt.id, true)}>Approve</ActionBtn>
                          <ActionBtn variant="reject"  disabled={actionLoading[apt.id]} onClick={() => handleAction(apt.id, false)}>Reject</ActionBtn>
                        </div>
                      </div>
                      {actionError[apt.id] && <p style={{ color: P.red, fontSize: 12, marginTop: 4 }}>{actionError[apt.id]}</p>}
                    </div>
                  ))}
                {pending.length > 5 && (
                  <button type="button" onClick={() => setTab('pending')} style={{ marginTop: 12, width: '100%', background: 'none', border: `1px solid ${P.slate200}`, borderRadius: 6, padding: '8px 0', fontSize: 13, fontWeight: 500, color: P.slate500, cursor: 'pointer' }}>
                    View all {pending.length} pending
                  </button>
                )}
              </Card>

              <Card style={{ padding: 24 }} className="span-full">
                <SectionTitle>Recent Bookings</SectionTitle>
                {appointments.slice(0, 6).map((apt, i) => (
                  <div key={apt.id}>
                    {i > 0 && <Divider />}
                    <div className="row-hover" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 8px', borderRadius: 8, flexWrap: 'wrap' }}>
                      <Initials name={apt.patient_name} />
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: P.slate900 }}>{apt.patient_name || 'Unknown'}</div>
                        <div style={{ fontSize: 12, color: P.slate500 }}>{apt.phone}</div>
                      </div>
                      <div style={{ fontSize: 13, color: P.slate700, minWidth: 80 }}>{fmtDate(apt.date)}</div>
                      <div style={{ fontWeight: 600, color: P.orange, minWidth: 45 }}>{apt.time}</div>
                      <SourceTag source={apt.source} />
                      <StatusTag status={apt.status} />
                      <div style={{ fontSize: 12, color: P.slate500, minWidth: 50, textAlign: 'right' }}>
                        {apt.payment_method === 'medical_aid' ? apt.medical_aid : 'Cash'}
                      </div>
                    </div>
                  </div>
                ))}
              </Card>

            </div>
          )}

          {tab === 'calendar' && (
            <div className="layout-cal">
              <Card style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <button type="button" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1))} style={{ background: 'none', border: `1px solid ${P.slate200}`, borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 13, color: P.slate700 }}>Prev</button>
                  <span style={{ fontWeight: 700, fontSize: 15, color: P.slate900 }}>{monthStr}</span>
                  <button type="button" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1))} style={{ background: 'none', border: `1px solid ${P.slate200}`, borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 13, color: P.slate700 }}>Next</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 4 }}>
                  {['S','M','T','W','T','F','S'].map((d, i) => (
                    <div key={i} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: P.slate500, padding: '4px 0', textTransform: 'uppercase' }}>{d}</div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
                  {weeks.flatMap((wk, wi) => wk.map((cell, di) => {
                    if (!cell) return <div key={`e-${wi}-${di}`} />;
                    const dayApts = forDay(cell.dateStr);
                    const pCount  = dayApts.filter(a => a.status === 'pending_approval').length;
                    const cCount  = dayApts.filter(a => a.status === 'confirmed').length;
                    const clash   = hasClash(cell.dateStr);
                    const isToday = cell.dateStr === today;
                    const isSel   = cell.dateStr === selectedDay;
                    return (
                      <div key={cell.dateStr}
                        className={`cal-cell${isToday ? ' is-today' : ''}${isSel ? ' is-selected' : ''}`}
                        onClick={() => setSelectedDay(isSel ? null : cell.dateStr)}>
                        <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? P.orange : P.slate700, marginBottom: 3 }}>{cell.day}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                          {clash   && <span style={{ fontSize: 9, background: P.red,       color: '#fff',   borderRadius: 3, padding: '1px 3px', fontWeight: 700 }}>!</span>}
                          {pCount > 0 && <span style={{ fontSize: 9, background: P.amberLight, color: P.amber, borderRadius: 3, padding: '1px 3px', fontWeight: 700 }}>{pCount}P</span>}
                          {cCount > 0 && <span style={{ fontSize: 9, background: P.greenLight, color: P.green, borderRadius: 3, padding: '1px 3px', fontWeight: 700 }}>{cCount}C</span>}
                        </div>
                      </div>
                    );
                  }))}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 14, fontSize: 11, color: P.slate500 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ background: P.amberLight, color: P.amber, borderRadius: 3, padding: '0 4px', fontWeight: 700, fontSize: 9 }}>P</span> Pending</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ background: P.greenLight, color: P.green, borderRadius: 3, padding: '0 4px', fontWeight: 700, fontSize: 9 }}>C</span> Confirmed</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ background: P.red, color: '#fff', borderRadius: 3, padding: '0 4px', fontWeight: 700, fontSize: 9 }}>!</span> Time clash</span>
                </div>
              </Card>

              <Card style={{ padding: 20 }}>
                <SectionTitle>{selectedDay ? fmtDateLong(selectedDay) : 'Select a day'}</SectionTitle>
                <div style={{ maxHeight: 520, overflowY: 'auto' }}>
                  {!selectedDay && <p style={{ color: P.slate500, fontSize: 14, textAlign: 'center', padding: '40px 0' }}>Tap a date on the calendar</p>}
                  {selectedDay && forDay(selectedDay).length === 0 && <p style={{ color: P.slate500, fontSize: 14, textAlign: 'center', padding: '40px 0' }}>No appointments</p>}
                  {selectedDay && forDay(selectedDay).sort((a, b) => a.time?.localeCompare(b.time)).map((apt, i) => (
                    <div key={apt.id}>
                      {i > 0 && <Divider />}
                      <div style={{ padding: '14px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <Initials name={apt.patient_name} size={32} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, color: P.slate900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{apt.patient_name || 'Unknown'}</div>
                            <div style={{ fontSize: 12, color: P.slate500 }}>{apt.phone}</div>
                          </div>
                          <StatusTag status={apt.status} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12, marginBottom: 10 }}>
                          <div><span style={{ color: P.slate500 }}>Time</span><br /><strong>{apt.time}</strong></div>
                          <div><span style={{ color: P.slate500 }}>Payment</span><br /><strong>{apt.payment_method === 'medical_aid' ? 'Medical Aid' : 'Cash'}</strong></div>
                          {apt.medical_aid && <div style={{ gridColumn: '1/-1' }}><span style={{ color: P.slate500 }}>Aid</span><br /><strong>{apt.medical_aid} · #{apt.membership_number}</strong></div>}
                          <div style={{ gridColumn: '1/-1' }}><SourceTag source={apt.source} /></div>
                        </div>
                        {apt.status === 'pending_approval' && (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <ActionBtn variant="approve" disabled={actionLoading[apt.id]} onClick={() => handleAction(apt.id, true)} style={{ flex: 1 }}>{actionLoading[apt.id] ? 'Processing…' : 'Approve'}</ActionBtn>
                            <ActionBtn variant="reject"  disabled={actionLoading[apt.id]} onClick={() => handleAction(apt.id, false)} style={{ flex: 1 }}>{actionLoading[apt.id] ? 'Processing…' : 'Reject'}</ActionBtn>
                          </div>
                        )}
                        {actionError[apt.id] && <p style={{ color: P.red, fontSize: 12, marginTop: 6 }}>{actionError[apt.id]}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {tab === 'table' && (
            <Card>
              <div style={{ padding: '16px 16px', borderBottom: `1px solid ${P.slate100}` }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type="search" placeholder="Search name or phone…" value={search} onChange={e => setSearch(e.target.value)}
                    style={{ flex: 1, minWidth: 160, border: `1px solid ${P.slate200}`, borderRadius: 6, padding: '7px 12px', fontSize: 13, color: P.slate700 }} />
                  {activeFilters > 0 && (
                    <button type="button" onClick={clearFilters} style={{ background: 'none', border: `1px solid ${P.slate200}`, borderRadius: 6, padding: '6px 14px', fontSize: 12, color: P.slate500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      Clear ({activeFilters})
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: P.slate500, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>Status</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {[['all','All'],['pending_approval','Pending'],['confirmed','Confirmed'],['rejected','Rejected']].map(([k, l]) => (
                        <button type="button" key={k} className={`filter-btn ${filterStatus === k ? 'active' : ''}`} onClick={() => setFilterStatus(k)}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: P.slate500, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>Source</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {[['all','All'],['whatsapp','WhatsApp'],['website','Website']].map(([k, l]) => (
                        <button type="button" key={k} className={`filter-btn ${filterSource === k ? 'active' : ''}`} onClick={() => setFilterSource(k)}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: P.slate500, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>Payment</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {[['all','All'],['cash','Cash'],['medical_aid','Medical Aid']].map(([k, l]) => (
                        <button type="button" key={k} className={`filter-btn ${filterPayment === k ? 'active' : ''}`} onClick={() => setFilterPayment(k)}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: P.slate500, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>Date Range</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                        style={{ border: `1px solid ${P.slate200}`, borderRadius: 6, padding: '5px 8px', fontSize: 12, color: P.slate700 }} />
                      <span style={{ fontSize: 12, color: P.slate500 }}>to</span>
                      <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                        style={{ border: `1px solid ${P.slate200}`, borderRadius: 6, padding: '5px 8px', fontSize: 12, color: P.slate700 }} />
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 600 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${P.slate100}` }}>
                      {[['patient_name','Patient'],['phone','Phone'],['date','Date & Time'],['payment_method','Payment'],['status','Status']].map(([f, l]) => (
                        <th key={f} style={{ padding: '11px 14px', textAlign: 'left' }}>
                          <button type="button" className="th-sort" onClick={() => toggleSort(f)}>{l} {sortField === f ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button>
                        </th>
                      ))}
                      <th className="hide-mobile" style={{ padding: '11px 14px', textAlign: 'left' }}><span style={{ fontSize: 11, fontWeight: 600, color: P.slate500, textTransform: 'uppercase', letterSpacing: '.6px' }}>Booked</span></th>
                      <th style={{ padding: '11px 14px', textAlign: 'left' }}><span style={{ fontSize: 11, fontWeight: 600, color: P.slate500, textTransform: 'uppercase', letterSpacing: '.6px' }}>Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr><td colSpan={7} style={{ padding: '48px 0', textAlign: 'center', color: P.slate500 }}>No appointments found</td></tr>
                    )}
                    {filtered.map(apt => (
                      <tr key={apt.id} className="row-hover" style={{ borderBottom: `1px solid ${P.slate100}` }}>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Initials name={apt.patient_name} size={30} />
                            <div>
                              <div style={{ fontWeight: 600, color: P.slate900 }}>{apt.patient_name || 'Unknown'}</div>
                              <SourceTag source={apt.source} />
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px', color: P.slate500 }}>{apt.phone}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 500, color: P.slate700 }}>{fmtDate(apt.date)}</div>
                          <div style={{ fontWeight: 700, color: P.orange }}>{apt.time}</div>
                          {hasClash(apt.date) && apt.status !== 'rejected' && <Tag bg={P.redLight} color={P.red}>Clash</Tag>}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {apt.payment_method === 'medical_aid'
                            ? <div><div style={{ fontWeight: 600, color: P.slate700 }}>{apt.medical_aid}</div><div style={{ fontSize: 11, color: P.slate500 }}>#{apt.membership_number}</div></div>
                            : <span style={{ color: P.green, fontWeight: 600 }}>Cash</span>}
                        </td>
                        <td style={{ padding: '12px 14px' }}><StatusTag status={apt.status} /></td>
                        <td className="hide-mobile" style={{ padding: '12px 14px', color: P.slate500, fontSize: 12 }}>{fmtTs(apt.created_at)}</td>
                        <td style={{ padding: '12px 14px' }}>
                          {apt.status === 'pending_approval' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <ActionBtn variant="approve" disabled={actionLoading[apt.id]} onClick={() => handleAction(apt.id, true)}>Approve</ActionBtn>
                              <ActionBtn variant="reject"  disabled={actionLoading[apt.id]} onClick={() => handleAction(apt.id, false)}>Reject</ActionBtn>
                            </div>
                          )}
                          {apt.status !== 'pending_approval' && <span style={{ color: P.slate200 }}>—</span>}
                          {actionError[apt.id] && <p style={{ color: P.red, fontSize: 11, marginTop: 4 }}>{actionError[apt.id]}</p>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '10px 16px', borderTop: `1px solid ${P.slate100}`, fontSize: 12, color: P.slate500 }}>
                {filtered.length} of {appointments.length} appointments
              </div>
            </Card>
          )}

          {tab === 'pending' && (
            <>
              {pending.length === 0 && (
                <Card style={{ padding: '64px 0', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: P.green, marginBottom: 8 }}>All clear</div>
                  <p style={{ color: P.slate500, fontSize: 14 }}>No pending appointments to review</p>
                </Card>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {pending.map(apt => (
                  <Card key={apt.id} style={{ borderLeft: `4px solid ${P.amber}`, overflow: 'hidden' }}>
                    <div style={{ padding: '18px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                        <Initials name={apt.patient_name} size={40} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 15, color: P.slate900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{apt.patient_name || 'Unknown'}</div>
                          <div style={{ fontSize: 13, color: P.slate500 }}>{apt.phone}</div>
                          <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            <SourceTag source={apt.source} />
                            {hasClash(apt.date) && <Tag bg={P.redLight} color={P.red}>Time clash</Tag>}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                        <div style={{ background: P.slate50, borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: P.slate500, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 2 }}>Date</div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: P.slate900 }}>{fmtDate(apt.date)}</div>
                        </div>
                        <div style={{ background: P.orangeLight, borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: P.slate500, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 2 }}>Time</div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: P.orange }}>{apt.time}</div>
                        </div>
                        <div style={{ background: P.slate50, borderRadius: 8, padding: '10px 12px', gridColumn: '1/-1' }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: P.slate500, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 2 }}>Payment</div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: P.slate900 }}>
                            {apt.payment_method === 'medical_aid' ? `${apt.medical_aid} · #${apt.membership_number}` : 'Cash'}
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: P.slate400, marginBottom: 12 }}>Submitted {fmtTs(apt.created_at)}</div>
                      {actionError[apt.id] && <p style={{ color: P.red, fontSize: 12, marginBottom: 8 }}>{actionError[apt.id]}</p>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: `1px solid ${P.slate100}` }}>
                      <button type="button" disabled={actionLoading[apt.id]} onClick={() => handleAction(apt.id, true)}
                        style={{ background: P.green, color: '#fff', border: 'none', borderRadius: '0 0 0 11px', padding: '12px 0', fontSize: 13, fontWeight: 600, cursor: actionLoading[apt.id] ? 'not-allowed' : 'pointer', opacity: actionLoading[apt.id] ? .5 : 1 }}>
                        {actionLoading[apt.id] ? 'Processing…' : 'Approve'}
                      </button>
                      <button type="button" disabled={actionLoading[apt.id]} onClick={() => handleAction(apt.id, false)}
                        style={{ background: '#fff', color: P.red, border: 'none', borderLeft: `1px solid ${P.slate100}`, borderRadius: '0 0 11px 0', padding: '12px 0', fontSize: 13, fontWeight: 600, cursor: actionLoading[apt.id] ? 'not-allowed' : 'pointer', opacity: actionLoading[apt.id] ? .5 : 1 }}>
                        {actionLoading[apt.id] ? 'Processing…' : 'Reject'}
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}

        </div>
      </div>
    </>
  );
}
