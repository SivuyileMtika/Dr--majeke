import React, { useState, useEffect } from 'react';
import { Calendar, Clock, User, Phone, Mail, MapPin, Heart, Shield, Stethoscope, CheckCircle, XCircle, Users, Award, Clock3, LogOut, Settings }from'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthModal } from './components/AuthModal';
import { AdminPanel } from './components/AdminPanel';
import { Appointment } from './types/auth';
import'./App.css';
import Header from './components/Header';
import homeBg from './assets/home-bg.jpg';

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
    return <AdminPanel onBack={() => setShowAdminPanel(false)} />;
  }

  return (
    // add top padding so content sits below fixed header (h-16)
    <div className="pt-16 min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50">
      {/* Use shared Header across all pages */}
      <Header
        isAuthenticated={isAuthenticated}
        user={user}
        onSignIn={() => { setAuthModalMode('login'); setShowAuthModal(true); }}
        onSignUp={() => { setAuthModalMode('register'); setShowAuthModal(true); }}
        onLogout={logout}
        onAdminToggle={() => setShowAdminPanel(!showAdminPanel)}
      />

      {/* Hero Section */}
      <section
        id="home"
        className="relative bg-cover bg-center bg-no-repeat py-10 md:py-24 px-4 sm:px-6 lg:px-8 flex items-start md:items-center home-hero-bg"
        style={{ backgroundImage: `url(${homeBg})` }}
      >
        {/* Overlay for readability */}
        <div className="absolute inset-0 bg-white/25"></div>
        <div className="max-w-7xl mx-auto relative z-10 w-full">
          <div className="text-center">
            <div className="mb-3 md:mb-8">
              <div className="inline-flex items-center bg-orange-100 text-orange-800 px-3 py-1 rounded-full font-semibold text-xs md:text-lg mb-3 md:mb-6">
                <Heart className="h-3 w-3 mr-1 md:h-5 md:w-5 md:mr-2" />
                Caring for Our Community Since 20...
              </div>
            </div>
            <h2 className="text-xl md:text-4xl font-bold text-gray-950 drop-shadow mb-3 md:mb-8">
              Passionate About Medicine.<br /><span className="bg-gradient-to-r from-orange-500 to-amber-600 bg-clip-text text-transparent">Compationate About People</span>
            </h2>
            <p className="text-sm md:text-xl lg:text-2xl text-gray-900 font-medium drop-shadow mb-6 md:mb-12 max-w-4xl mx-auto leading-relaxed">
              Experience compassionate, comprehensive healthcare with <span className="blur-sm select-none">Dr. SG Majeke</span>.
              Your trusted family doctor providing personalized care for all ages.
            </p>
            <div className="flex flex-row gap-3 md:gap-6 justify-center items-center">
              <button
                onClick={() => {
                  setShowBookingSection(true);
                  document.getElementById('booking')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-5 py-2 md:px-10 md:py-5 rounded-full font-bold text-sm md:text-xl hover:from-orange-600 hover:to-orange-700 transition-all duration-300 shadow-lg"
              >
                Book Consultation
              </button>
              <a href="#services" className="border-2 border-gray-800 text-gray-800 px-5 py-2 md:px-10 md:py-5 rounded-full font-bold text-sm md:text-xl hover:bg-gray-800 hover:text-white transition-all duration-300">
                Our Services
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-gradient-to-r from-gray-900 to-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="text-white">
              <div className="bg-orange-500 w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2">
                <Users className="h-5 w-5" />
              </div>
              <div className="text-lg md:text-3xl lg:text-4xl font-bold">1000+</div>
              <div className="text-xs md:text-lg lg:text-xl text-gray-300">Happy Patients</div>
            </div>
            <div className="text-white">
              <div className="bg-orange-500 w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2">
                <Award className="h-5 w-5" />
              </div>
              <div className="text-lg md:text-3xl lg:text-4xl font-bold">15+</div>
              <div className="text-xs md:text-lg lg:text-xl text-gray-300">Yrs Experience</div>
            </div>
            <div className="text-white">
              <div className="bg-orange-500 w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2">
                <Clock3 className="h-5 w-5" />
              </div>
              <div className="text-lg md:text-3xl lg:text-4xl font-bold">24/7</div>
              <div className="text-xs md:text-lg lg:text-xl text-gray-300">Emergency</div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section id="services" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <h3 className="text-2xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">Our Medical Services</h3>
            <p className="text-lg md:text-xl lg:text-2xl text-gray-600 max-w-3xl mx-auto">
              Comprehensive healthcare services tailored to meet your individual and family needs
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-10">
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-10 rounded-3xl hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-3 border-2 border-orange-200">
              <div className="bg-gradient-to-r from-orange-500 to-orange-600 w-20 h-20 rounded-full flex items-center justify-center mb-8 shadow-lg">
                <Heart className="h-10 w-10 text-white" />
              </div>
              <h4 className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900 mb-6">General Checkups</h4>
              <p className="text-gray-700 text-lg leading-relaxed">Comprehensive health assessments, routine screenings, and preventive care to keep you in optimal health.</p>
            </div>
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-10 rounded-3xl hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-3 border-2 border-gray-200">
              <div className="bg-gradient-to-r from-gray-700 to-gray-800 w-20 h-20 rounded-full flex items-center justify-center mb-8 shadow-lg">
                <Shield className="h-10 w-10 text-white" />
              </div>
              <h4 className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900 mb-6">Family Medicine</h4>
              <p className="text-gray-700 text-lg leading-relaxed">Complete healthcare for all family members, from pediatric care to geriatric medicine and everything in between.</p>
            </div>
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-10 rounded-3xl hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-3 border-2 border-orange-200">
              <div className="bg-gradient-to-r from-orange-500 to-orange-600 w-20 h-20 rounded-full flex items-center justify-center mb-8 shadow-lg">
                <Stethoscope className="h-10 w-10 text-white" />
              </div>
              <h4 className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900 mb-6">Chronic Care Management</h4>
              <p className="text-gray-700 text-lg leading-relaxed">Ongoing management of chronic conditions like diabetes, hypertension, and heart disease with personalized treatment plans.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Booking Section */}
      <section id="booking" className="py-24 bg-gradient-to-br from-gray-50 to-orange-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h3 className="text-2xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">Book Your Consultation</h3>
            <p className="text-lg md:text-xl lg:text-2xl text-gray-600 max-w-3xl mx-auto">
              Schedule your appointment with <span className="blur-sm select-none">Dr. SG Majeke</span> - easy, fast, and convenient
            </p>
          </div>

          {!showBookingSection ? (
            <div className="text-center">
              <div className="bg-white rounded-3xl shadow-2xl p-16 max-w-4xl mx-auto border-2 border-orange-100">
                <div className="mb-8">
                  <div className="bg-gradient-to-r from-orange-100 to-amber-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Calendar className="h-12 w-12 text-orange-600" />
                  </div>
                  <h4 className="text-xl md:text-2xl lg:text-3xl font-bold text-gray-900 mb-4">Ready to Book Your Appointment?</h4>
                  <p className="text-base md:text-lg lg:text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
                    Take the first step towards better health. Our easy booking system lets you choose your preferred date and time.
                  </p>
                </div>
                
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="text-center p-2">
                    <div className="bg-orange-100 w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2">
                      <Calendar className="h-5 w-5 text-orange-600" />
                    </div>
                    <h5 className="font-bold text-xs text-gray-900">Choose Date</h5>
                    <p className="text-gray-500 text-xs">Available dates</p>
                  </div>
                  <div className="text-center p-2">
                    <div className="bg-orange-100 w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2">
                      <Clock className="h-5 w-5 text-orange-600" />
                    </div>
                    <h5 className="font-bold text-xs text-gray-900">Pick Time</h5>
                    <p className="text-gray-500 text-xs">Preferred slot</p>
                  </div>
                  <div className="text-center p-2">
                    <div className="bg-orange-100 w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2">
                      <CheckCircle className="h-5 w-5 text-orange-600" />
                    </div>
                    <h5 className="font-bold text-xs text-gray-900">Confirm</h5>
                    <p className="text-gray-500 text-xs">Complete booking</p>
                  </div>
                </div>

                {!isAuthenticated ? (
                  <div className="mb-8">
                    <div className="bg-orange-50 rounded-2xl p-6 border-2 border-orange-200 mb-6">
                      <p className="text-orange-800 font-semibold text-lg">
                        Please sign in or create an account to book your appointment
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
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
                    className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-8 py-3 rounded-2xl font-bold text-base md:text-lg hover:from-orange-600 hover:to-orange-700 transition-all duration-300 shadow-2xl whitespace-nowrap"
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Date Selection */}
                  <div className="bg-white rounded-2xl shadow-md p-4 border border-orange-100">
                    <h4 className="text-base font-bold text-gray-900 mb-3 flex items-center">
                      <Calendar className="h-5 w-5 text-orange-600 mr-2" />
                      Select Date
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {getAvailableDates().map((date) => {
                        const availableSlots = getAvailableSlotsForDate(date);
                        const isFullyBooked = availableSlots === 0;
                        
                        return (
                          <button
                            key={date}
                            onClick={() => !isFullyBooked && handleDateSelect(date)}
                            disabled={isFullyBooked}
                            className={`p-2 rounded-xl text-center transition-all duration-200 border ${
                              isFullyBooked
                                ? 'bg-red-50 border-red-200 cursor-not-allowed opacity-60'
                                : selectedDate === date
                                ? 'bg-orange-600 text-white shadow border-orange-600'
                                : 'bg-gray-50 hover:bg-orange-50 hover:border-orange-300 border-gray-200'
                            }`}
                          >
                            <div className="font-bold text-xs">
                              {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </div>
                            <div className="text-xs opacity-75">
                              {new Date(date).toLocaleDateString('en-US', { weekday: 'short' })}
                            </div>
                            {isFullyBooked ? (
                              <div className="text-xs text-red-500 font-bold">Full</div>
                            ) : (
                              <div className="text-xs text-orange-500 font-semibold">{availableSlots} slots</div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Time Selection */}
                  <div className="bg-white rounded-2xl shadow-md p-4 border border-orange-100">
                    <h4 className="text-base font-bold text-gray-900 mb-3 flex items-center">
                      <Clock className="h-5 w-5 text-orange-600 mr-2" />
                      Select Time
                    </h4>
                    {selectedDate ? (
                      <div className="grid grid-cols-3 gap-2">
                        {timeSlots.map((slot) => {
                          const isBooked = isSlotBooked(selectedDate, slot.time);
                          return (
                            <button
                              key={slot.time}
                              onClick={() => handleTimeSelect(slot.time)}
                              disabled={isBooked}
                              className={`p-2 rounded-xl transition-all duration-200 text-center border ${
                                isBooked
                                  ? 'bg-red-50 text-red-400 cursor-not-allowed border-red-200'
                                  : selectedTime === slot.time
                                  ? 'bg-orange-600 text-white shadow border-orange-600'
                                  : 'bg-gray-50 hover:bg-orange-50 hover:border-orange-300 border-gray-200'
                              }`}
                            >
                              <span className="font-bold text-xs block">{slot.time}</span>
                              {isBooked ? (
                                <span className="text-xs">Full</span>
                              ) : selectedTime === slot.time ? (
                                <CheckCircle className="h-3 w-3 mx-auto mt-1" />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Calendar className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-gray-500 text-sm">Select a date first</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Booking Form */}
                {showBookingForm && isAuthenticated && (
                  <div className="mt-4 bg-white rounded-2xl shadow-md p-4 border border-orange-100">
                    <h4 className="text-base font-bold text-gray-900 mb-3 flex items-center">
                      <User className="h-5 w-5 text-orange-600 mr-2" />
                      Patient Information
                    </h4>
                    <div className="mb-3 p-3 bg-orange-50 rounded-xl border border-orange-200">
                      <p className="text-orange-800 font-semibold text-sm">
                        {formatDate(bookingData.date)} at {bookingData.time}
                      </p>
                    </div>
                    <form onSubmit={handleBookingSubmit} className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Full Name *</label>
                          <input
                            type="text"
                            required
                            value={bookingData.name}
                            onChange={(e) => setBookingData({ ...bookingData, name: e.target.value })}
                            className="w-full p-2 border border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none text-sm"
                            placeholder="Full name"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Email *</label>
                          <input
                            type="email"
                            required
                            value={bookingData.email}
                            onChange={(e) => setBookingData({ ...bookingData, email: e.target.value })}
                            className="w-full p-2 border border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none text-sm"
                            placeholder="Email"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Phone Number *</label>
                        <input
                          type="tel"
                          required
                          value={bookingData.phone}
                          onChange={(e) => setBookingData({ ...bookingData, phone: e.target.value })}
                          className="w-full p-2 border border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none text-sm"
                          placeholder="Phone number"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Reason for Visit</label>
                        <textarea
                          value={bookingData.reason}
                          onChange={(e) => setBookingData({ ...bookingData, reason: e.target.value })}
                          rows={2}
                          className="w-full p-2 border border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none text-sm"
                          placeholder="Brief description (optional)"
                        />
                      </div>

                      {/* Payment Section */}
                      <div className="border-t border-gray-200 pt-3">
                        <h5 className="text-sm font-bold text-gray-900 mb-2">Payment Information</h5>
                        
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
                              className={`py-3 px-2 rounded-xl border-2 transition-all duration-300 text-center ${
                                bookingData.paymentType === 'cash'
                                  ? 'bg-green-600 text-white border-green-600 shadow-lg'
                                  : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-green-300'
                              }`}
                            >
                              <div className="font-bold text-sm whitespace-nowrap">Cash</div>
                              <div className="text-xs opacity-75 whitespace-nowrap">Pay at practice</div>
                            </button>
                            <button
                              type="button"
                              onClick={() => setBookingData({ ...bookingData, paymentType: 'medical' })}
                              className={`py-3 px-2 rounded-xl border-2 transition-all duration-300 text-center ${
                                bookingData.paymentType === 'medical'
                                  ? 'bg-blue-600 text-white border-blue-600 shadow-lg'
                                  : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-blue-300'
                              }`}
                            >
                              <div className="font-bold text-sm whitespace-nowrap">Medical Aid</div>
                              <div className="text-xs opacity-75 whitespace-nowrap">Insurance</div>
                            </button>
                          </div>
                        </div>

                        {/* Medical Aid Details */}
                        {bookingData.paymentType === 'medical' && (
                          <div className="space-y-2 bg-blue-50 p-3 rounded-xl border border-blue-200">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label htmlFor="medicalAidProvider" className="block text-xs font-bold text-gray-700 mb-1">Provider *</label>
                                <select
                                  id="medicalAidProvider"
                                  required
                                  aria-label="Medical Aid Provider"
                                  value={bookingData.medicalAid}
                                  onChange={(e) => setBookingData({ ...bookingData, medicalAid: e.target.value, medicalPlan: '' })}
                                  className="w-full p-2 border border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none text-xs bg-white"
                                >
                                  <option value="">Select provider</option>
                                  {Object.keys(medicalAidProviders).map((provider) => (
                                    <option key={provider} value={provider}>{provider}</option>
                                  ))}
                                </select>
                              </div>
                              {bookingData.medicalAid && (
                                <div>
                                  <label className="block text-xs font-bold text-gray-700 mb-1">Plan *</label>
                                  <select
                                    id="medicalPlan"
                                    required
                                    aria-label="Medical Aid Plan"
                                    value={bookingData.medicalPlan}
                                    onChange={(e) => setBookingData({ ...bookingData, medicalPlan: e.target.value })}
                                    className="w-full p-2 border border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none text-xs bg-white"
                                  >
                                    <option value="">Select plan</option>
                                    {medicalAidProviders[bookingData.medicalAid as keyof typeof medicalAidProviders]?.map((plan) => (
                                      <option key={plan} value={plan}>{plan}</option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1">Membership Number *</label>
                              <input
                                type="text"
                                required
                                value={bookingData.membershipNumber}
                                onChange={(e) => setBookingData({ ...bookingData, membershipNumber: e.target.value })}
                                className="w-full p-2 border border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none text-xs bg-white"
                                placeholder="Membership number"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-row gap-3 items-center">
                        <button
                          type="submit"
                          className="flex-1 bg-gradient-to-r from-orange-500 to-orange-600 text-white py-3 rounded-xl font-bold text-sm hover:from-orange-600 hover:to-orange-700 transition-all duration-300 shadow-xl"
                        >
                          Submit Booking
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowBookingForm(false)}
                          className="flex-1 py-3 border-2 border-gray-300 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-50 transition-colors"
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
            <h3 className="text-2xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">Get In Touch</h3>
            <p className="text-lg md:text-xl lg:text-2xl text-gray-600 max-w-3xl mx-auto">
              Contact <span className="blur-sm select-none">Dr. SG Majeke</span>'s practice for any questions or emergency consultations
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 rounded-2xl bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200">
              <div className="bg-gradient-to-r from-orange-500 to-orange-600 w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2 shadow">
                <Phone className="h-5 w-5 text-white" />
              </div>
              <h4 className="text-xs font-bold text-gray-900 mb-1">Phone</h4>
              <p className="text-gray-700 text-xs font-semibold">089 255 0069</p>
              <p className="text-gray-500 text-xs mt-1">8am-5pm</p>
            </div>
            <div className="text-center p-3 rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200">
              <div className="bg-gradient-to-r from-gray-700 to-gray-800 w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2 shadow">
                <Mail className="h-5 w-5 text-white" />
              </div>
              <h4 className="text-xs font-bold text-gray-900 mb-1">Mail</h4>
              <p className="text-gray-700 text-xs font-semibold blur-sm select-none">dr@email.com</p>
              <p className="text-gray-500 text-xs mt-1">24hrs reply</p>
            </div>
            <div className="text-center p-3 rounded-2xl bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200">
              <div className="bg-gradient-to-r from-orange-500 to-orange-600 w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2 shadow">
                <MapPin className="h-5 w-5 text-white" />
              </div>
              <h4 className="text-xs font-bold text-gray-900 mb-1">Address</h4>
              <p className="text-gray-700 text-xs font-semibold">F254 Ngcwabe St</p>
              <p className="text-gray-500 text-xs mt-1">Mt Frere, 5090</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-950 text-white">
        {/* Top footer */}
        <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-3 gap-8 border-b border-gray-800">
          {/* Brand */}
          <div className="flex flex-col items-start gap-3">
            <div className="flex items-center gap-3">
              <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Logo" className="h-12 w-12 object-contain" />
              <div>
                <h5 className="font-bold text-white blur-sm select-none">Dr. SG Majeke</h5>
                <p className="text-orange-400 text-xs">General Practitioner</p>
                <p className="text-gray-500 text-xs">MBChB, Family Medicine</p>
              </div>
            </div>
            <p className="text-gray-400 text-xs leading-relaxed">
              Passionate about Medicine.<br />Compassionate about People.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h6 className="text-orange-400 font-semibold text-sm mb-3 uppercase tracking-widest">Quick Links</h6>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><a href="#home" className="hover:text-orange-400 transition-colors">Home</a></li>
              <li><a href="#services" className="hover:text-orange-400 transition-colors">Services</a></li>
              <li><a href="#booking" className="hover:text-orange-400 transition-colors">Book Appointment</a></li>
              <li><a href="#contact" className="hover:text-orange-400 transition-colors">Contact Us</a></li>
            </ul>
          </div>

          {/* Social & Contact */}
          <div>
            <h6 className="text-orange-400 font-semibold text-sm mb-3 uppercase tracking-widest">Connect</h6>
            <div className="flex gap-3 mb-4">
              {/* Facebook */}
              <a href="#" aria-label="Facebook" className="bg-gray-800 hover:bg-blue-600 p-2 rounded-lg transition-colors">
                <svg className="w-5 h-5 fill-white" viewBox="0 0 24 24"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.268h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
              </a>
              {/* Instagram */}
              <a href="#" aria-label="Instagram" className="bg-gray-800 hover:bg-pink-600 p-2 rounded-lg transition-colors">
                <svg className="w-5 h-5 fill-white" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              </a>
              {/* X / Twitter */}
              <a href="#" aria-label="X" className="bg-gray-800 hover:bg-black p-2 rounded-lg transition-colors">
                <svg className="w-5 h-5 fill-white" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>
              {/* LinkedIn */}
              <a href="#" aria-label="LinkedIn" className="bg-gray-800 hover:bg-blue-700 p-2 rounded-lg transition-colors">
                <svg className="w-5 h-5 fill-white" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              </a>
            </div>
            <p className="text-gray-400 text-xs">📞 089 255 0069</p>
            <p className="text-gray-400 text-xs mt-1">Mon – Fri: 08:00 – 17:00</p>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-gray-500 text-xs">&copy; 2025 <span className="blur-sm select-none">Dr. SG Majeke</span> General Practice. All rights reserved.</p>
          <p className="text-gray-600 text-xs">Built with care for the community.</p>
        </div>
      </footer>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        initialMode={authModalMode}
      />

      {/* Floating WhatsApp Button */}
      <a
        href="https://wa.me/27834289828"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 bg-green-500 hover:bg-green-600 rounded-full shadow-lg transition-transform hover:scale-110"
        aria-label="Chat on WhatsApp"
      >
        <svg viewBox="0 0 32 32" className="w-8 h-8 fill-white" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0C7.163 0 0 7.163 0 16c0 2.822.736 5.469 2.027 7.773L0 32l8.427-2.009A15.93 15.93 0 0016 32c8.837 0 16-7.163 16-16S24.837 0 16 0zm0 29.333a13.27 13.27 0 01-6.771-1.854l-.486-.289-5.006 1.194 1.234-4.873-.317-.499A13.27 13.27 0 012.667 16C2.667 8.636 8.636 2.667 16 2.667S29.333 8.636 29.333 16 23.364 29.333 16 29.333zm7.273-9.878c-.398-.199-2.354-1.161-2.719-1.294-.366-.133-.632-.199-.898.199-.266.398-1.031 1.294-1.264 1.56-.233.266-.465.299-.863.1-.398-.199-1.682-.62-3.204-1.977-1.184-1.056-1.983-2.36-2.216-2.758-.233-.398-.025-.613.175-.811.18-.178.398-.465.598-.698.199-.232.266-.398.398-.664.133-.266.066-.498-.033-.698-.1-.199-.898-2.164-1.231-2.963-.324-.778-.653-.673-.898-.686l-.765-.013c-.266 0-.698.1-1.064.498-.366.398-1.397 1.365-1.397 3.33s1.43 3.862 1.629 4.128c.199.266 2.814 4.298 6.818 6.026.953.411 1.696.657 2.275.841.956.304 1.826.261 2.514.158.767-.114 2.354-.962 2.687-1.891.333-.929.333-1.727.233-1.891-.1-.166-.366-.266-.764-.465z"/>
        </svg>
      </a>
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