import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.REACT_APP_DOCTOR_TOKEN || '';

export default function WhatsAppBookingsPanel() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [actionError, setActionError] = useState({});

  useEffect(() => {
    if (!AUTH_TOKEN) {
      setError('REACT_APP_DOCTOR_TOKEN not configured');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const q = query(
      collection(db, 'appointments'),
      where('status', 'in', ['pending_approval', 'confirmed']),
      orderBy('created_at', 'desc')
    );

    const unsub = onSnapshot(q, snapshot => {
      const docs = [];
      snapshot.forEach(d => docs.push({ id: d.id, ...d.data() }));
      setAppointments(docs);
      setLoading(false);
    }, err => {
      console.error('onSnapshot error', err);
      setError('Failed to load appointments');
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      if (timestamp.seconds) return new Date(timestamp.seconds * 1000).toLocaleString('en-ZA');
      if (timestamp instanceof Date) return timestamp.toLocaleString('en-ZA');
      return new Date(timestamp).toLocaleString('en-ZA');
    } catch {
      return 'Invalid date';
    }
  };

  const formatAppointmentTime = (date, time) => {
    if (!date || !time) return 'N/A';
    try {
      const dt = new Date(`${date}T${time}`);
      return dt.toLocaleString('en-ZA');
    } catch {
      return `${date} ${time}`;
    }
  };

  const handleApprove = async (id) => {
    setActionLoading(s => ({ ...s, [id]: true }));
    setActionError(s => ({ ...s, [id]: null }));
    try {
      const axiosConfig = {
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
      };
      await axios.post(`${API_BASE}/confirm-appointment`,
        { appointmentId: id, confirm: true, doctorName: 'Dr. Dashboard' },
        axiosConfig
      );
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Action failed';
      console.error('Action failed', err);
      setActionError(s => ({ ...s, [id]: errMsg }));
    } finally {
      setActionLoading(s => ({ ...s, [id]: false }));
    }
  };

  const handleReject = async (id) => {
    setActionLoading(s => ({ ...s, [id]: true }));
    setActionError(s => ({ ...s, [id]: null }));
    try {
      const axiosConfig = {
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
      };
      await axios.post(`${API_BASE}/confirm-appointment`,
        { appointmentId: id, confirm: false, doctorName: 'Dr. Dashboard' },
        axiosConfig
      );
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Action failed';
      console.error('Action failed', err);
      setActionError(s => ({ ...s, [id]: errMsg }));
    } finally {
      setActionLoading(s => ({ ...s, [id]: false }));
    }
  };

  if (loading) return <div className="p-3">Loading appointments...</div>;
  if (error) return <div className="p-3 text-danger">{error}</div>;
  if (!appointments.length) return <div className="p-3">No appointments.</div>;

  const pending = appointments.filter(a => a.status === 'pending_approval');
  const confirmed = appointments.filter(a => a.status === 'confirmed');

  return (
    <div className="container p-3">
      {pending.length > 0 && (
        <>
          <h4 className="mb-3">⏳ Pending Approval ({pending.length})</h4>
          <div className="row">
            {pending.map(apt => (
              <div key={apt.id} className="col-12 col-md-6 mb-3">
                <div className="card border-warning">
                  <div className="card-body">
                    <h5 className="card-title">{apt.patient_name || 'Unknown'}</h5>
                    <h6 className="card-subtitle mb-2 text-muted">{apt.phone}</h6>
                    <p className="card-text">
                      📅 {formatAppointmentTime(apt.date, apt.time)}<br />
                      💳 {apt.payment_method === 'medical_aid' ? apt.medical_aid + ' (' + apt.membership_number + ')' : 'Cash'}
                    </p>
                    <p className="card-text"><small className="text-muted">Booked: {formatTimestamp(apt.created_at)}</small></p>
                    {actionError[apt.id] && <div className="alert alert-danger p-2 mb-2">{actionError[apt.id]}</div>}
                    <div className="btn-group" role="group">
                      <button
                        className="btn btn-success"
                        onClick={() => handleApprove(apt.id)}
                        disabled={actionLoading[apt.id]}
                      >
                        {actionLoading[apt.id] ? 'Processing...' : '✓ Approve'}
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => handleReject(apt.id)}
                        disabled={actionLoading[apt.id]}
                      >
                        {actionLoading[apt.id] ? 'Processing...' : '✗ Reject'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {confirmed.length > 0 && (
        <>
          <h4 className="mb-3 mt-4">✅ Confirmed Appointments ({confirmed.length})</h4>
          <div className="row">
            {confirmed.map(apt => (
              <div key={apt.id} className="col-12 col-md-6 mb-3">
                <div className="card border-success">
                  <div className="card-body">
                    <h5 className="card-title">{apt.patient_name || 'Unknown'}</h5>
                    <h6 className="card-subtitle mb-2 text-muted">{apt.phone}</h6>
                    <p className="card-text">
                      📅 {formatAppointmentTime(apt.date, apt.time)}<br />
                      💳 {apt.payment_method === 'medical_aid' ? apt.medical_aid + ' (' + apt.membership_number + ')' : 'Cash'}
                    </p>
                    <p className="card-text"><small className="text-success">Approved: {formatTimestamp(apt.approved_at)}</small></p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
