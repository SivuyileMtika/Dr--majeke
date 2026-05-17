import React from 'react';

const Header: React.FC = () => (
  <header className="w-full bg-white shadow-md py-4 px-6 flex justify-between items-center fixed top-0 left-0 z-50">
    <div className="flex items-center gap-2">
      <img src="/vite.svg" alt="Logo" className="h-8 w-8" />
      <span className="font-bold text-xl text-orange-700">Dr. SG Majeke</span>
    </div>
    <nav className="hidden md:flex gap-8">
      <a href="#home" className="text-gray-700 hover:text-orange-600 font-semibold transition">Home</a>
      <a href="#services" className="text-gray-700 hover:text-orange-600 font-semibold transition">Services</a>
      <a href="#booking" className="text-gray-700 hover:text-orange-600 font-semibold transition">Book</a>
      <a href="#contact" className="text-gray-700 hover:text-orange-600 font-semibold transition">Contact</a>
    </nav>
    {/* Add mobile menu button here if needed */}
  </header>
);

export default Header;