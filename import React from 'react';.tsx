import React from 'react';
import { Heart } from 'lucide-react';

const HeroSection = ({ setShowBookingSection }: { setShowBookingSection: (show: boolean) => void }) => (
  <section
    id="home"
    className="relative bg-cover bg-center bg-no-repeat py-24 px-4 sm:px-6 lg:px-8 min-h-[300px] max-h-[500px] flex items-center home-hero-bg"
  >
    <div className="absolute inset-0 bg-white/80"></div>
    <div className="max-w-7xl mx-auto relative z-10 w-full">
      <div className="text-center">
        <div className="mb-8">
          <div className="inline-flex items-center bg-orange-100 text-orange-800 px-6 py-3 rounded-full font-semibold text-lg mb-6">
            <Heart className="h-5 w-5 mr-2" />
            Caring for Our Community Since 2010
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
);

export default HeroSection;