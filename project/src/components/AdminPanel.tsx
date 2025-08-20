import React, { useState, useEffect } from 'react';
import { Calendar, Clock, User, Phone, Mail, CheckCircle, XCircle, AlertCircle, Search, Filter, ArrowLeft } from 'lucide-react';
import { Appointment } from '../types/auth';

export const AdminPanel: React.FC = () => {
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
    window.location.href = '/admin';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back Button */}
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 text-white hover:bg-orange-700 transition mb-6 shadow"
        >
          <ArrowLeft size={20} />
          <span className="font-semibold">Back</span>
        </button>

        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Admin Panel</h1>
          <p className="text-xl text-gray-600">Manage patient appointments and bookings</p>
        </div>

        {/* Statistics Cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-2xl shadow-lg p-6 border-2 border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-600">Total Appointments</p>
                <p className="text-3xl font-bold text-gray-900">{appointments.length}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-full">
                <Calendar className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6 border-2 border-yellow-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-600">Pending</p>
                <p className="text-3xl font-bold text-yellow-600">{pendingCount}</p>
              </div>
              <div className="bg-yellow-100 p-3 rounded-full">
                <AlertCircle className="h-6 w-6 text-yellow-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6 border-2 border-green-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-600">Approved</p>
                <p className="text-3xl font-bold text-green-600">{approvedCount}</p>
              </div>
              <div className="bg-green-100 p-3 rounded-full">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6 border-2 border-red-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-600">Declined</p>
                <p className="text-3xl font-bold text-red-600">{declinedCount}</p>
              </div>
              <div className="bg-red-100 p-3 rounded-full">
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
        <div className="space-y-6">
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
              <div key={appointment.id} className="bg-white rounded-2xl shadow-lg border-2 border-gray-100 overflow-hidden">
                <div className="p-6">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="bg-orange-100 p-3 rounded-full">
                          <User className="h-6 w-6 text-orange-600" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-gray-900">{appointment.userName}</h3>
                          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold border ${getStatusColor(appointment.status)}`}>
                            {getStatusIcon(appointment.status)}
                            {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                          </div>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4 mb-4">
                        <div className="flex items-center gap-3">
                          <Calendar className="h-5 w-5 text-gray-400" />
                          <span className="text-gray-700 font-semibold">{formatDate(appointment.date)}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Clock className="h-5 w-5 text-gray-400" />
                          <span className="text-gray-700 font-semibold">{appointment.time}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Mail className="h-5 w-5 text-gray-400" />
                          <span className="text-gray-700">{appointment.userEmail}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Phone className="h-5 w-5 text-gray-400" />
                          <span className="text-gray-700">{appointment.userPhone}</span>
                        </div>
                      </div>

                      {/* Payment Information */}
                      <div className="bg-blue-50 rounded-xl p-4 mb-4">
                        <p className="text-sm font-semibold text-gray-600 mb-2">Payment Information:</p>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-700">Payment Type:</span>
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              appointment.paymentType === 'medical' 
                                ? 'bg-blue-100 text-blue-800' 
                                : 'bg-green-100 text-green-800'
                            }`}>
                              {appointment.paymentType === 'medical' ? 'Medical Aid' : 'Cash Payment'}
                            </span>
                          </div>
                          {appointment.paymentType === 'medical' && appointment.medicalAid && (
                            <>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-700">Medical Aid:</span>
                                <span className="text-sm text-gray-800">{appointment.medicalAid}</span>
                              </div>
                              {appointment.medicalPlan && (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-700">Plan:</span>
                                  <span className="text-sm text-gray-800">{appointment.medicalPlan}</span>
                                </div>
                              )}
                              {appointment.membershipNumber && (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-700">Membership #:</span>
                                  <span className="text-sm text-gray-800">{appointment.membershipNumber}</span>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {appointment.reason && (
                        <div className="bg-gray-50 rounded-xl p-4">
                          <p className="text-sm font-semibold text-gray-600 mb-1">Reason for Visit:</p>
                          <p className="text-gray-800">{appointment.reason}</p>
                        </div>
                      )}
                    </div>

                    {appointment.status === 'pending' && (
                      <div className="flex flex-col sm:flex-row gap-3 lg:flex-col lg:w-48">
                        <button
                          onClick={() => updateAppointmentStatus(appointment.id, 'approved')}
                          className="flex items-center justify-center gap-2 bg-green-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-green-700 transition-colors"
                        >
                          <CheckCircle className="h-5 w-5" />
                          Approve
                        </button>
                        <button
                          onClick={() => updateAppointmentStatus(appointment.id, 'declined')}
                          className="flex items-center justify-center gap-2 bg-red-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-red-700 transition-colors"
                        >
                          <XCircle className="h-5 w-5" />
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