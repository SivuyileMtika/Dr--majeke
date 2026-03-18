import React, { useState, useEffect } from 'react';
import { Calendar, Clock, User, Phone, Mail, CheckCircle, XCircle, AlertCircle, Search, Filter, ArrowLeft } from 'lucide-react';
import { Appointment } from '../types/auth';

export const AdminPanel: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'declined'>('all');

  useEffect(() => {
    // Load appointments from localStorage
    const storedAppointments = localStorage.getItem('appointments');
    if (storedAppointments) {
      setAppointments(JSON.parse(storedAppointments));
    }
  }, []);

  const updateAppointmentStatus = (appointmentId: string, status: 'approved' | 'declined') => {
    const updatedAppointments = appointments.map(appointment =>
      appointment.id === appointmentId ? { ...appointment, status } : appointment
    );
    setAppointments(updatedAppointments);
    localStorage.setItem('appointments', JSON.stringify(updatedAppointments));
    
    // Trigger a custom event to notify other components of the change
    window.dispatchEvent(new CustomEvent('appointmentsUpdated'));
  };

  const filteredAppointments = appointments.filter(appointment => {
    const matchesSearch = appointment.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         appointment.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         appointment.reason.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || appointment.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const sortedFilteredAppointments = [...filteredAppointments].sort((a, b) => {
    // Only sort if status is 'pending'
    if (a.status === 'pending' && b.status === 'pending') {
      // Combine date and time for comparison
      const aDateTime = new Date(`${a.date}T${a.time}`);
      const bDateTime = new Date(`${b.date}T${b.time}`);
      return aDateTime.getTime() - bDateTime.getTime();
    }
    // Otherwise, keep original order
    return 0;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'declined':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-4 w-4" />;
      case 'declined':
        return <XCircle className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const pendingCount = appointments.filter(a => a.status === 'pending').length;
  const approvedCount = appointments.filter(a => a.status === 'approved').length;
  const declinedCount = appointments.filter(a => a.status === 'declined').length;

  // Back button handler
  const handleBack = () => {
    if (onBack) onBack();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50 py-8">
      {/* Back Button — far left */}
      <div className="px-4 mb-4">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 text-white hover:bg-orange-700 transition shadow"
        >
          <ArrowLeft size={20} />
          <span className="font-semibold">Back</span>
        </button>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header with logo */}
        <div className="mb-4 flex items-center gap-3 bg-white rounded-xl shadow-md px-4 py-3 border-l-4 border-orange-600">
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="Practice Logo"
            className="h-10 w-10 object-contain flex-shrink-0"
          />
          <div>
            <h1 className="text-lg font-bold text-gray-900">Admin Panel</h1>
            <p className="text-orange-600 text-xs">Manage patient appointments and bookings</p>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl shadow p-3 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500">Total</p>
                <p className="text-2xl font-bold text-gray-900">{appointments.length}</p>
              </div>
              <div className="bg-blue-100 p-2 rounded-full">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow p-3 border border-yellow-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
              </div>
              <div className="bg-yellow-100 p-2 rounded-full">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow p-3 border border-green-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500">Approved</p>
                <p className="text-2xl font-bold text-green-600">{approvedCount}</p>
              </div>
              <div className="bg-green-100 p-2 rounded-full">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow p-3 border border-red-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500">Declined</p>
                <p className="text-2xl font-bold text-red-600">{declinedCount}</p>
              </div>
              <div className="bg-red-100 p-2 rounded-full">
                <XCircle className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-8 border-2 border-gray-100">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search appointments..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none transition-colors"
                />
              </div>
            </div>
            <div className="md:w-48">
              <div className="relative">
                <Filter className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <select
                  aria-label="Filter appointments by status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none transition-colors appearance-none bg-white"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="declined">Declined</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Appointments List */}
        <div className="space-y-3">
          {sortedFilteredAppointments.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-lg p-12 text-center border-2 border-gray-100">
              <Calendar className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">No appointments found</h3>
              <p className="text-gray-600">
                {appointments.length === 0 
                  ? "No appointments have been booked yet." 
                  : "Try adjusting your search or filter criteria."
                }
              </p>
            </div>
          ) : (
            sortedFilteredAppointments.map((appointment) => (
              <div key={appointment.id} className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden">
                <div className="p-4">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="bg-orange-100 p-2 rounded-full">
                          <User className="h-5 w-5 text-orange-600" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-gray-900">{appointment.userName}</h3>
                          <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border ${getStatusColor(appointment.status)}`}>
                            {getStatusIcon(appointment.status)}
                            {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 mb-2 text-sm">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          <span className="text-gray-700 font-medium truncate">{formatDate(appointment.date)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          <span className="text-gray-700 font-medium">{appointment.time}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          <span className="text-gray-600 truncate">{appointment.userEmail}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          <span className="text-gray-600">{appointment.userPhone}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 text-xs">
                        <span className={`px-2 py-0.5 rounded-full font-semibold ${
                          appointment.paymentType === 'medical'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {appointment.paymentType === 'medical' ? 'Medical Aid' : 'Cash'}
                        </span>
                        {appointment.paymentType === 'medical' && appointment.medicalAid && (
                          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">
                            {appointment.medicalAid}{appointment.medicalPlan ? ` · ${appointment.medicalPlan}` : ''}{appointment.membershipNumber ? ` · #${appointment.membershipNumber}` : ''}
                          </span>
                        )}
                        {appointment.reason && (
                          <span className="px-2 py-0.5 rounded-full bg-orange-50 text-orange-800 font-medium max-w-xs truncate">
                            {appointment.reason}
                          </span>
                        )}
                      </div>
                    </div>

                    {appointment.status === 'pending' && (
                      <div className="flex flex-row gap-2 lg:flex-col lg:w-36">
                        <button
                          onClick={() => updateAppointmentStatus(appointment.id, 'approved')}
                          className="flex items-center justify-center gap-1.5 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors flex-1 lg:flex-none"
                        >
                          <CheckCircle className="h-4 w-4" />
                          Approve
                        </button>
                        <button
                          onClick={() => updateAppointmentStatus(appointment.id, 'declined')}
                          className="flex items-center justify-center gap-1.5 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors flex-1 lg:flex-none"
                        >
                          <XCircle className="h-4 w-4" />
                          Decline
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};