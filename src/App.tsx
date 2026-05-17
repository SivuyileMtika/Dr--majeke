import React, { useState, useEffect } from 'react';
import { Calendar, Clock, User, Phone, Mail, MapPin, Heart, Shield, Stethoscope, CheckCircle, XCircle, Users, Award, Clock3, LogOut, Settings }from'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthModal } from './components/AuthModal';
import { AdminPanel } from './components/AdminPanel';
import { Appointment } from './types/auth';
import'./App.css';

interface TimeSlot {
  time: string;
  available: boolean;
}

interface BookingData {
  date: string;
  time: string;
  name: string;
  email: string;
  phone: string;
  reason: string;
  paymentType: 'cash' | 'medical';
  medicalAid: string;
  medicalPlan: string;
  membershipNumber: string;
}

function AppContent() {
  const { user, isAuthenticated, logout } = useAuth();
  const [showBookingSection, setShowBookingSection] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [showBookingForm, setShowBookingForm] = useState<boolean>(false);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [showAdminPanel, setShowAdminPanel] = useState<boolean>(false);
  const [bookingData, setBookingData] = useState<BookingData>({
    date: '',
    time: '',
    name: '',
    email: '',
    phone: '',
    reason: '',
    paymentType: 'cash',
    medicalAid: '',
    medicalPlan: '',
    membershipNumber: ''
  });
  const [bookedSlots, setBookedSlots] = useState<string[]>([
    '2025-01-15-09:00',
    '2025-01-15-14:00',
    '2025-01-16-10:30',
    '2025-01-17-11:00',
    '2025-01-18-09:30',
    '2025-01-18-15:00'
  ]);

  // Load booked slots from appointments on component mount and when appointments change
  useEffect(() => {
    const loadBookedSlots = () => {
      const storedAppointments = localStorage.getItem('appointments');
      if (storedAppointments) {
        const appointments: Appointment[] = JSON.parse(storedAppointments);
        const approvedSlots = appointments
          .filter(appointment => appointment.status === 'approved')
          .map(appointment => `${appointment.date}-${appointment.time}`);
        
        // Combine with initial booked slots
        const initialBookedSlots = [
          '2025-01-15-09:00',
          '2025-01-15-14:00',
          '2025-01-16-10:30',
          '2025-01-17-11:00',
          '2025-01-18-09:30',
          '2025-01-18-15:00'
        ];
        
        const allBookedSlots = [...new Set([...initialBookedSlots, ...approvedSlots])];
        setBookedSlots(allBookedSlots);
      }
    };

    loadBookedSlots();
    
    // Listen for storage changes to update booked slots when appointments are approved
    const handleStorageChange = () => {
      loadBookedSlots();
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Also check for changes periodically (for same-tab updates)
    const interval = setInterval(loadBookedSlots, 1000);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  const timeSlots: TimeSlot[] = [
    { time: '08:00', available: true },
    { time: '08:30', available: true },
    { time: '09:00', available: true },
    { time: '09:30', available: true },
    { time: '10:00', available: true },
    { time: '10:30', available: true },
    { time: '11:00', available: true },
    { time: '11:30', available: true },
    { time: '14:00', available: true },
    { time: '14:30', available: true },
    { time: '15:00', available: true },
    { time: '15:30', available: true },
    { time: '16:00', available: true },
    { time: '16:30', available: true }
  ];

  const getAvailableDates = () => {
    const dates = [];
    const today = new Date();
    for (let i = 1; i <= 14; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      if (date.getDay() !== 0 && date.getDay() !== 6) { // Exclude weekends
        dates.push(date.toISOString().split('T')[0]);
      }
    }
    return dates;
  };

  const isSlotBooked = (date: string, time: string) => {
    return bookedSlots.includes(`${date}-${time}`);
  };

  const getAvailableSlotsForDate = (date: string) => {
    return timeSlots.filter(slot => !isSlotBooked(date, slot.time)).length;
  };

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setSelectedTime('');
    setShowBookingForm(false);
  };

  const handleTimeSelect = (time: string) => {
    if (!isAuthenticated) {
      setAuthModalMode('login');
      setShowAuthModal(true);
      return;
    }
    
    if (!isSlotBooked(selectedDate, time)) {
      setSelectedTime(time);
      setBookingData({ 
        ...bookingData, 
        date: selectedDate, 
        time,
        name: user?.name || '',
        email: user?.email || '',
        phone: user?.phone || ''
      });
      setShowBookingForm(true);
    }
  };

  const handleBookingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Create appointment
    const appointment: Appointment = {
      id: Date.now().toString(),
      userId: user!.id,
      userName: bookingData.name,
      userEmail: bookingData.email,
      userPhone: bookingData.phone,
      date: bookingData.date,
      time: bookingData.time,
      reason: bookingData.reason,
      status: 'pending',
      createdAt: new Date().toISOString(),
      paymentType: bookingData.paymentType,
      medicalAid: bookingData.medicalAid,
      medicalPlan: bookingData.medicalPlan,
      membershipNumber: bookingData.membershipNumber
    };
    
    // Save to localStorage (in real app, this would be sent to backend)
    const existingAppointments = JSON.parse(localStorage.getItem('appointments') || '[]');
    existingAppointments.push(appointment);
    localStorage.setItem('appointments', JSON.stringify(existingAppointments));
    
    setBookedSlots([...bookedSlots, `${bookingData.date}-${bookingData.time}`]);
    alert('Booking request submitted! Please wait for admin approval.');
    setShowBookingForm(false);
    setSelectedDate('');
    setSelectedTime('');
    setBookingData({
      date: '',
      time: '',
      name: '',
      email: '',
      phone: '',
      reason: '',
      paymentType: 'cash',
      medicalAid: '',
      medicalPlan: '',
      membershipNumber: ''
    });
  };

  // South African Medical Aid providers and their plans
  const medicalAidProviders = {
    'Discovery Health': [
      'Discovery Health Essential',
      'Discovery Health Classic',
      'Discovery Health Comprehensive',
      'Discovery Health Executive'
    ],
    'Momentum Health': [
      'Momentum Health Ingwe',
      'Momentum Health Myriad',
      'Momentum Health Summit',
      'Momentum Health Custom'
    ],
    'Bonitas': [
      'Bonitas Standard',
      'Bonitas Primary',
      'Bonitas Select',
      'Bonitas BonCap',
      'Bonitas BonEssential'
    ],
    'Medshield': [
      'Medshield MediValue',
      'Medshield MediBonus',
      'Medshield MediCore',
      'Medshield MediElite'
    ],
    'Bestmed': [
      'Bestmed Beat 1',
      'Bestmed Beat 2',
      'Bestmed Beat 3',
      'Bestmed Pace 1',
      'Bestmed Pace 2'
    ],
    'Gems': [
      'Gems Emerald',
      'Gems Ruby',
      'Gems Diamond',
      'Gems Sapphire'
    ],
    'Keyhealth': [
      'Keyhealth Starter',
      'Keyhealth Access',
      'Keyhealth Elevate',
      'Keyhealth Comprehensive'
    ],
    'Fedhealth': [
      'Fedhealth Maxima Exec',
      'Fedhealth Maxima Entrant',
      'Fedhealth Maxima Traditional',
      'Fedhealth Flexifed'
    ],
    'Profmed': [
      'Profmed Compcare',
      'Profmed Pinnacle',
      'Profmed Plus',
      'Profmed Primary'
    ],
    'Other': [
      'Please specify in reason for visit'
    ]
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


  if (showAdminPanel && user?.role === 'admin') {
    return <AdminPanel />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50">
      {/* Header */}
      <header className="bg-white shadow-xl sticky top-0 z-50 border-b-4 border-orange-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="relative">
                <img 
                  src="/api/placeholder/80/80" 
                  alt="Dr. SG Majeke Logo" 
                  className="h-16 w-16 rounded-full shadow-lg border-2 border-orange-500"
                />
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Dr. SG Majeke</h1>
                <p className="text-orange-600 font-semibold text-lg">General Practitioner</p>
                <p className="text-gray-600 text-sm">MBChB, Family Medicine</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-6">
              <nav className="hidden md:flex space-x-8">
                <a href="#home" className="text-gray-700 hover:text-orange-600 transition-colors font-semibold text-lg">Home</a>
                <a href="#services" className="text-gray-700 hover:text-orange-600 transition-colors font-semibold text-lg">Services</a>
                <a href="#booking" className="text-gray-700 hover:text-orange-600 transition-colors font-semibold text-lg">Book Now</a>
                <a href="#contact" className="text-gray-700 hover:text-orange-600 transition-colors font-semibold text-lg">Contact</a>
              </nav>
              
              {isAuthenticated ? (
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <p className="text-lg font-semibold text-gray-900">Hello, {user?.name}</p>
                    <p className="text-sm text-gray-600">{user?.role === 'admin' ? 'Administrator' : 'Patient'}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {user?.role === 'admin' && (
                      <button
                        onClick={() => setShowAdminPanel(!showAdminPanel)}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center space-x-2"
                      >
                        <Settings className="h-4 w-4" />
                        <span>Admin Panel</span>
                      </button>
                    )}
                    <button
                      onClick={logout}
                      className="bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-gray-700 transition-colors flex items-center space-x-2"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Logout</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => {
                      setAuthModalMode('login');
                      setShowAuthModal(true);
                    }}
                    className="text-gray-700 hover:text-orange-600 transition-colors font-semibold text-lg"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => {
                      setAuthModalMode('register');
                      setShowAuthModal(true);
                    }}
                    className="bg-orange-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-orange-700 transition-colors"
                  >
                    Sign Up
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section
        id="home"
        className="relative bg-cover bg-center bg-no-repeat py-24 px-4 sm:px-6 lg:px-8 min-h-[300px] max-h-[500px] flex items-center home-hero-bg"
      >
        {/* Overlay for readability */}
        <div className="absolute inset-0 bg-white/80"></div>
        <div className="max-w-7xl mx-auto relative z-10 w-full">
          <div className="text-center">
            <div className="mb-8">
              <div className="inline-flex items-center bg-orange-100 text-orange-800 px-6 py-3 rounded-full font-semibold text-lg mb-6">
                <Heart className="h-5 w-5 mr-2" />
                Caring for Our Community Since 20...
              </div>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8">
              Passionate About Medicine.<span className="bg-gradient-to-r from-orange-500 to-amber-600 bg-clip-text text-transparent">Compationate About People</span>
            </h2>
            <p className="text-2xl text-gray-700 mb-12 max-w-4xl mx-auto leading-relaxed">
              Experience compassionate, comprehensive healthcare with Dr. SG Majeke. 
              Your trusted family doctor providing personalized care for all ages.
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
              <button 
                onClick={() => {
                  setShowBookingSection(true);
                  document.getElementById('booking')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-10 py-5 rounded-full font-bold text-xl hover:from-orange-600 hover:to-orange-700 transform hover:scale-105 transition-all duration-300 shadow-2xl"
              >
                Book Consultation
              </button>
              <a href="#services" className="border-3 border-gray-800 text-gray-800 px-10 py-5 rounded-full font-bold text-xl hover:bg-gray-800 hover:text-white transition-all duration-300">
                Our Services
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-gradient-to-r from-gray-900 to-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div className="text-white">
              <div className="bg-orange-500 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="h-8 w-8" />
              </div>
              <div className="text-4xl font-bold mb-2">5000+</div>
              <div className="text-xl text-gray-300">Happy Patients</div>
            </div>
            <div className="text-white">
              <div className="bg-orange-500 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Award className="h-8 w-8" />
              </div>
              <div className="text-4xl font-bold mb-2">15+</div>
              <div className="text-xl text-gray-300">Years Experience</div>
            </div>
            <div className="text-white">
              <div className="bg-orange-500 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock3 className="h-8 w-8" />
              </div>
              <div className="text-4xl font-bold mb-2">24/7</div>
              <div className="text-xl text-gray-300">Emergency Support</div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section id="services" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <h3 className="text-5xl font-bold text-gray-900 mb-6">Our Medical Services</h3>
            <p className="text-2xl text-gray-600 max-w-3xl mx-auto">
              Comprehensive healthcare services tailored to meet your individual and family needs
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-10">
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-10 rounded-3xl hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-3 border-2 border-orange-200">
              <div className="bg-gradient-to-r from-orange-500 to-orange-600 w-20 h-20 rounded-full flex items-center justify-center mb-8 shadow-lg">
                <Heart className="h-10 w-10 text-white" />
              </div>
              <h4 className="text-2xl font-bold text-gray-900 mb-6">General Checkups</h4>
              <p className="text-gray-700 text-lg leading-relaxed">Comprehensive health assessments, routine screenings, and preventive care to keep you in optimal health.</p>
            </div>
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-10 rounded-3xl hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-3 border-2 border-gray-200">
              <div className="bg-gradient-to-r from-gray-700 to-gray-800 w-20 h-20 rounded-full flex items-center justify-center mb-8 shadow-lg">
                <Shield className="h-10 w-10 text-white" />
              </div>
              <h4 className="text-2xl font-bold text-gray-900 mb-6">Family Medicine</h4>
              <p className="text-gray-700 text-lg leading-relaxed">Complete healthcare for all family members, from pediatric care to geriatric medicine and everything in between.</p>
            </div>
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-10 rounded-3xl hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-3 border-2 border-orange-200">
              <div className="bg-gradient-to-r from-orange-500 to-orange-600 w-20 h-20 rounded-full flex items-center justify-center mb-8 shadow-lg">
                <Stethoscope className="h-10 w-10 text-white" />
              </div>
              <h4 className="text-2xl font-bold text-gray-900 mb-6">Chronic Care Management</h4>
              <p className="text-gray-700 text-lg leading-relaxed">Ongoing management of chronic conditions like diabetes, hypertension, and heart disease with personalized treatment plans.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Booking Section */}
      <section id="booking" className="py-24 bg-gradient-to-br from-gray-50 to-orange-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h3 className="text-5xl font-bold text-gray-900 mb-6">Book Your Consultation</h3>
            <p className="text-2xl text-gray-600 max-w-3xl mx-auto">
              Schedule your appointment with Dr. SG Majeke - easy, fast, and convenient
            </p>
          </div>

          {!showBookingSection ? (
            <div className="text-center">
              <div className="bg-white rounded-3xl shadow-2xl p-16 max-w-4xl mx-auto border-2 border-orange-100">
                <div className="mb-8">
                  <div className="bg-gradient-to-r from-orange-100 to-amber-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Calendar className="h-12 w-12 text-orange-600" />
                  </div>
                  <h4 className="text-3xl font-bold text-gray-900 mb-4">Ready to Book Your Appointment?</h4>
                  <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
                    Take the first step towards better health. Our easy booking system lets you choose your preferred date and time.
                  </p>
                </div>
                
                <div className="grid md:grid-cols-3 gap-6 mb-10">
                  <div className="text-center p-6">
                    <div className="bg-orange-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Calendar className="h-8 w-8 text-orange-600" />
                    </div>
                    <h5 className="font-bold text-lg text-gray-900 mb-2">Choose Date</h5>
                    <p className="text-gray-600">Select from available dates</p>
                  </div>
                  <div className="text-center p-6">
                    <div className="bg-orange-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Clock className="h-8 w-8 text-orange-600" />
                    </div>
                    <h5 className="font-bold text-lg text-gray-900 mb-2">Pick Time</h5>
                    <p className="text-gray-600">Choose your preferred slot</p>
                  </div>
                  <div className="text-center p-6">
                    <div className="bg-orange-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle className="h-8 w-8 text-orange-600" />
                    </div>
                    <h5 className="font-bold text-lg text-gray-900 mb-2">Confirm</h5>
                    <p className="text-gray-600">Complete your booking</p>
                  </div>
                </div>

                {!isAuthenticated ? (
                  <div className="mb-8">
                    <div className="bg-orange-50 rounded-2xl p-6 border-2 border-orange-200 mb-6">
                      <p className="text-orange-800 font-semibold text-lg">
                        Please sign in or create an account to book your appointment
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                      <button
                        onClick={() => {
                          setAuthModalMode('login');
                          setShowAuthModal(true);
                        }}
                        className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-8 py-4 rounded-2xl font-bold text-lg hover:from-orange-600 hover:to-orange-700 transition-all duration-300 shadow-lg"
                      >
                        Sign In to Book
                      </button>
                      <button
                        onClick={() => {
                          setAuthModalMode('register');
                          setShowAuthModal(true);
                        }}
                        className="border-2 border-orange-500 text-orange-600 px-8 py-4 rounded-2xl font-bold text-lg hover:bg-orange-500 hover:text-white transition-all duration-300"
                      >
                        Create Account
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowBookingSection(true)}
                    className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-12 py-5 rounded-2xl font-bold text-xl hover:from-orange-600 hover:to-orange-700 transform hover:scale-105 transition-all duration-300 shadow-2xl"
                  >
                    Start Booking Process
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div className="text-center mb-8">
                <button
                  onClick={() => {
                    setShowBookingSection(false);
                    setSelectedDate('');
                    setSelectedTime('');
                    setShowBookingForm(false);
                  }}
                  className="text-orange-600 hover:text-orange-700 font-semibold text-lg flex items-center justify-center mx-auto gap-2 mb-4"
                >
                  ← Back to Booking Overview
                </button>
                {!isAuthenticated && (
                  <div className="bg-orange-100 rounded-2xl p-6 border-2 border-orange-200 max-w-2xl mx-auto">
                    <p className="text-orange-800 font-semibold text-lg">
                      Please <button 
                        onClick={() => {
                          setAuthModalMode('register');
                          setShowAuthModal(true);
                        }}
                        className="text-orange-600 underline hover:text-orange-700"
                      >
                        register
                      </button> or <button 
                        onClick={() => {
                          setAuthModalMode('login');
                          setShowAuthModal(true);
                        }}
                        className="text-orange-600 underline hover:text-orange-700"
                      >
                        sign in
                      </button> to book an appointment
                    </p>
                  </div>
                )}
              </div>

              <div className="max-w-6xl mx-auto">
                <div className="grid lg:grid-cols-2 gap-10">
                  {/* Date Selection */}
                  <div className="bg-white rounded-3xl shadow-2xl p-10 border-2 border-orange-100">
                    <h4 className="text-3xl font-bold text-gray-900 mb-8 flex items-center">
                      <Calendar className="h-8 w-8 text-orange-600 mr-4" />
                      Select Date
                    </h4>
                    <div className="grid grid-cols-1 gap-4">
                      {getAvailableDates().map((date) => {
                        const availableSlots = getAvailableSlotsForDate(date);
                        const isFullyBooked = availableSlots === 0;
                        
                        return (
                          <button
                            key={date}
                            onClick={() => !isFullyBooked && handleDateSelect(date)}
                            disabled={isFullyBooked}
                            className={`p-6 rounded-2xl text-left transition-all duration-300 border-2 ${
                              isFullyBooked
                                ? 'bg-red-50 border-red-200 cursor-not-allowed opacity-60'
                                : selectedDate === date
                                ? 'bg-orange-600 text-white shadow-xl transform scale-105 border-orange-600'
                                : 'bg-gray-50 hover:bg-orange-50 hover:border-orange-300 border-gray-200 hover:shadow-lg'
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <div>
                                <div className="font-bold text-xl">
                                  {new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                                </div>
                                <div className="text-sm opacity-75">
                                  {new Date(date).toLocaleDateString('en-US', { weekday: 'long' })}
                                </div>
                              </div>
                              <div className={`text-right ${isFullyBooked ? 'text-red-600' : selectedDate === date ? 'text-white' : 'text-orange-600'}`}>
                                {isFullyBooked ? (
                                  <div className="font-bold text-lg">FULLY BOOKED</div>
                                ) : (
                                  <div>
                                    <div className="font-bold text-lg">{availableSlots} slots</div>
                                    <div className="text-sm opacity-75">available</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Time Selection */}
                  <div className="bg-white rounded-3xl shadow-2xl p-10 border-2 border-orange-100">
                    <h4 className="text-3xl font-bold text-gray-900 mb-8 flex items-center">
                      <Clock className="h-8 w-8 text-orange-600 mr-4" />
                      Select Time
                    </h4>
                    {selectedDate ? (
                      <div className="grid grid-cols-2 gap-4">
                        {timeSlots.map((slot) => {
                          const isBooked = isSlotBooked(selectedDate, slot.time);
                          return (
                            <button
                              key={slot.time}
                              onClick={() => handleTimeSelect(slot.time)}
                              disabled={isBooked}
                              className={`p-5 rounded-2xl transition-all duration-300 flex items-center justify-between border-2 ${
                                isBooked
                                  ? 'bg-red-50 text-red-500 cursor-not-allowed border-red-200'
                                  : selectedTime === slot.time
                                  ? 'bg-orange-600 text-white shadow-xl transform scale-105 border-orange-600'
                                  : 'bg-gray-50 hover:bg-orange-50 hover:border-orange-300 border-gray-200 hover:shadow-lg'
                              }`}
                            >
                              <span className="font-bold text-lg">{slot.time}</span>
                              {isBooked ? (
                                <div className="flex items-center">
                                  <span className="text-sm mr-2">BOOKED</span>
                                  <XCircle className="h-5 w-5" />
                                </div>
                              ) : selectedTime === slot.time ? (
                                <CheckCircle className="h-6 w-6" />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-16">
                        <Calendar className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500 text-xl">Please select a date first</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Booking Form */}
                {showBookingForm && isAuthenticated && (
                  <div className="mt-10 bg-white rounded-3xl shadow-2xl p-10 border-2 border-orange-100">
                    <h4 className="text-3xl font-bold text-gray-900 mb-8 flex items-center">
                      <User className="h-8 w-8 text-orange-600 mr-4" />
                      Patient Information
                    </h4>
                    <div className="mb-8 p-6 bg-gradient-to-r from-orange-50 to-amber-50 rounded-2xl border-2 border-orange-200">
                      <p className="text-orange-800 font-bold text-xl">
                         {formatDate(bookingData.date)} at {bookingData.time}
                      </p>
                    </div>
                    <form onSubmit={handleBookingSubmit} className="space-y-8">
                      <div className="grid md:grid-cols-2 gap-8">
                        <div>
                          <label className="block text-lg font-bold text-gray-700 mb-3">
                            Full Name *
                          </label>
                          <input
                            type="text"
                            required
                            value={bookingData.name}
                            onChange={(e) => setBookingData({ ...bookingData, name: e.target.value })}
                            className="w-full p-5 border-2 border-gray-200 rounded-2xl focus:border-orange-500 focus:outline-none transition-colors text-lg"
                            placeholder="Enter your full name"
                          />
                        </div>
                        <div>
                          <label className="block text-lg font-bold text-gray-700 mb-3">
                            Email Address *
                          </label>
                          <input
                            type="email"
                            required
                            value={bookingData.email}
                            onChange={(e) => setBookingData({ ...bookingData, email: e.target.value })}
                            className="w-full p-5 border-2 border-gray-200 rounded-2xl focus:border-orange-500 focus:outline-none transition-colors text-lg"
                            placeholder="Enter your email"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-lg font-bold text-gray-700 mb-3">
                          Phone Number *
                        </label>
                        <input
                          type="tel"
                          required
                          value={bookingData.phone}
                          onChange={(e) => setBookingData({ ...bookingData, phone: e.target.value })}
                          className="w-full p-5 border-2 border-gray-200 rounded-2xl focus:border-orange-500 focus:outline-none transition-colors text-lg"
                          placeholder="Enter your phone number"
                        />
                      </div>
                      <div>
                        <label className="block text-lg font-bold text-gray-700 mb-3">
                          Reason for Visit
                        </label>
                        <textarea
                          value={bookingData.reason}
                          onChange={(e) => setBookingData({ ...bookingData, reason: e.target.value })}
                          rows={4}
                          className="w-full p-5 border-2 border-gray-200 rounded-2xl focus:border-orange-500 focus:outline-none transition-colors text-lg"
                          placeholder="Brief description of your concern (optional)"
                        />
                      </div>
                      
                      {/* Payment Section */}
                      <div className="border-t-2 border-gray-200 pt-8">
                        <h5 className="text-2xl font-bold text-gray-900 mb-6">Payment Information</h5>
                        
                        {/* Payment Type Selection */}
                        <div className="mb-6">
                          <label className="block text-lg font-bold text-gray-700 mb-3">
                            Payment Method *
                          </label>
                          <div className="grid grid-cols-2 gap-4">
                            <button
                              type="button"
                              onClick={() => setBookingData({ 
                                ...bookingData, 
                                paymentType: 'cash',
                                medicalAid: '',
                                medicalPlan: '',
                                membershipNumber: ''
                              })}
                              className={`p-4 rounded-2xl border-2 transition-all duration-300 ${
                                bookingData.paymentType === 'cash'
                                  ? 'bg-green-600 text-white border-green-600 shadow-lg'
                                  : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-green-300'
                              }`}
                            >
                              <div className="font-bold text-lg">Cash Payment</div>
                              <div className="text-sm opacity-75">Pay at practice</div>
                            </button>
                            <button
                              type="button"
                              onClick={() => setBookingData({ ...bookingData, paymentType: 'medical' })}
                              className={`p-4 rounded-2xl border-2 transition-all duration-300 ${
                                bookingData.paymentType === 'medical'
                                  ? 'bg-blue-600 text-white border-blue-600 shadow-lg'
                                  : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-blue-300'
                              }`}
                            >
                              <div className="font-bold text-lg">Medical Aid</div>
                              <div className="text-sm opacity-75">Insurance coverage</div>
                            </button>
                          </div>
                        </div>

                        {/* Medical Aid Details */}
                        {bookingData.paymentType === 'medical' && (
                          <div className="space-y-6 bg-blue-50 p-6 rounded-2xl border-2 border-blue-200">
                            <div>
                              <label htmlFor="medicalAidProvider" className="block text-lg font-bold text-gray-700 mb-3">
                                Medical Aid Provider *
                              </label>
                              <select
                                id="medicalAidProvider"
                                required
                                aria-label="Medical Aid Provider"
                                value={bookingData.medicalAid}
                                onChange={(e) => setBookingData({ 
                                  ...bookingData, 
                                  medicalAid: e.target.value,
                                  medicalPlan: '' // Reset plan when provider changes
                                })}
                                className="w-full p-4 border-2 border-gray-200 rounded-2xl focus:border-blue-500 focus:outline-none transition-colors text-lg bg-white"
                              >
                                <option value="">Select your medical aid</option>
                                {Object.keys(medicalAidProviders).map((provider) => (
                                  <option key={provider} value={provider}>
                                    {provider}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {bookingData.medicalAid && (
                              <div>
                                <label className="block text-lg font-bold text-gray-700 mb-3">
                                  Plan/Option *
                                </label>
                                <select
                                  id="medicalPlan"
                                  required
                                  aria-label="Medical Aid Plan"
                                  value={bookingData.medicalPlan}
                                  onChange={(e) => setBookingData({ ...bookingData, medicalPlan: e.target.value })}
                                  className="w-full p-4 border-2 border-gray-200 rounded-2xl focus:border-blue-500 focus:outline-none transition-colors text-lg bg-white"
                                >
                                  <option value="">Select your plan</option>
                                  {medicalAidProviders[bookingData.medicalAid as keyof typeof medicalAidProviders]?.map((plan) => (
                                    <option key={plan} value={plan}>
                                      {plan}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            <div>
                              <label className="block text-lg font-bold text-gray-700 mb-3">
                                Membership Number *
                              </label>
                              <input
                                type="text"
                                required
                                value={bookingData.membershipNumber}
                                onChange={(e) => setBookingData({ ...bookingData, membershipNumber: e.target.value })}
                                className="w-full p-4 border-2 border-gray-200 rounded-2xl focus:border-blue-500 focus:outline-none transition-colors text-lg bg-white"
                                placeholder="Enter your membership number"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex gap-6">
                        <button
                          type="submit"
                          className="flex-1 bg-gradient-to-r from-orange-500 to-orange-600 text-white py-6 px-10 rounded-2xl font-bold text-xl hover:from-orange-600 hover:to-orange-700 transition-all duration-300 shadow-xl transform hover:scale-105"
                        >
                          Submit Booking Request
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowBookingForm(false)}
                          className="px-10 py-6 border-2 border-gray-300 text-gray-700 rounded-2xl font-bold text-xl hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <h3 className="text-5xl font-bold text-gray-900 mb-6">Get In Touch</h3>
            <p className="text-2xl text-gray-600 max-w-3xl mx-auto">
              Contact Dr. SG Majeke's practice for any questions or emergency consultations
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-10">
            <div className="text-center p-10 rounded-3xl bg-gradient-to-br from-orange-50 to-orange-100 hover:shadow-2xl transition-all duration-500 border-2 border-orange-200">
              <div className="bg-gradient-to-r from-orange-500 to-orange-600 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-8 shadow-lg">
                <Phone className="h-10 w-10 text-white" />
              </div>
              <h4 className="text-2xl font-bold text-gray-900 mb-4">Phone</h4>
              <p className="text-gray-700 text-xl font-semibold">039 255 0069</p>
              <p className="text-gray-600 mt-2">Available 8am-5pm</p>
            </div>
            <div className="text-center p-10 rounded-3xl bg-gradient-to-br from-gray-50 to-gray-100 hover:shadow-2xl transition-all duration-500 border-2 border-gray-200">
              <div className="bg-gradient-to-r from-gray-700 to-gray-800 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-8 shadow-lg">
                <Mail className="h-10 w-10 text-white" />
              </div>
              <h4 className="text-2xl font-bold text-gray-900 mb-4">Mail</h4>
              <p className="text-gray-700 text-xl font-semibold">doctormajeke@outlook.com</p>
              <p className="text-gray-600 mt-2">We respond within 24 hours</p>
            </div>
            <div className="text-center p-10 rounded-3xl bg-gradient-to-br from-orange-50 to-orange-100 hover:shadow-2xl transition-all duration-500 border-2 border-orange-200">
              <div className="bg-gradient-to-r from-orange-500 to-orange-600 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-8 shadow-lg">
                <MapPin className="h-10 w-10 text-white" />
              </div>
              <h4 className="text-2xl font-bold text-gray-900 mb-4">Address</h4>
              <p className="text-gray-700 text-xl font-semibold">F254 Ngcwabe Street<br />Mount Frere,5090</p>
              <p className="text-gray-600 mt-2">Easy parking available</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gradient-to-r from-gray-900 to-gray-800 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="flex items-center justify-center space-x-4 mb-6">
              <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-3 rounded-full shadow-lg">
                <Stethoscope className="h-8 w-8 text-white" />
              </div>
              <div className="text-left">
                <h5 className="text-2xl font-bold">Dr. SG Majeke</h5>
                <p className="text-orange-400">General Practitioner</p>
              </div>
            </div>
            <p className="text-gray-300 mb-8 text-xl">Passionate about Medicine.Compationate about People</p>
            <div className="border-t border-gray-700 pt-8">
              <p className="text-gray-400 text-lg">&copy; 2025 Dr. SG Majeke General Practice. All rights reserved.</p>
            </div>
          </div>
        </div>
      </footer>

      {/* Auth Modal */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)}
        initialMode={authModalMode}
      />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;