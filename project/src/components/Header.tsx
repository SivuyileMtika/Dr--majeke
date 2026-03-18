import React, { useState } from 'react';
import { Settings, LogOut, Menu, X } from 'lucide-react';

interface HeaderProps {
  isAuthenticated?: boolean;
  user?: { name?: string; role?: string } | null;
  onSignIn?: () => void;
  onSignUp?: () => void;
  onLogout?: () => void;
  onAdminToggle?: () => void;
}

const Header: React.FC<HeaderProps> = ({ isAuthenticated, user, onSignIn, onSignUp, onLogout, onAdminToggle }) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="fixed top-0 left-0 w-full z-50 bg-white shadow-md">
      <div className="w-full h-16 flex items-center justify-between">

        {/* Far LEFT: logo + title */}
        <div className="flex items-center gap-3 pl-2 flex-shrink-0">
          <a href="#home" className="flex items-center gap-3" onClick={closeMenu}>
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="Dr. SG Majeke Logo"
              className="h-8 w-8 md:h-10 md:w-10 rounded-full object-cover flex-shrink-0"
            />
            <div className="leading-none overflow-hidden">
              <div className="text-sm font-bold text-orange-700 truncate max-w-[8rem] sm:max-w-xs blur-sm select-none">
                Dr. SG Majeke
              </div>
              <div className="text-xs text-black truncate max-w-[8rem] sm:max-w-xs" style={{fontSize:'10px'}}>
                General Practitioner
              </div>
              <div className="text-orange-500 truncate max-w-[8rem] sm:max-w-xs" style={{fontSize:'10px'}}>
                MBChB, Family Medicine
              </div>
            </div>
          </a>
        </div>

        {/* CENTER: Nav links — desktop only */}
        <nav className="hidden md:flex flex-1 justify-center items-center gap-6" aria-label="Main navigation">
          <a href="#home" className="text-gray-700 hover:text-orange-600 font-medium text-sm">Home</a>
          <a href="#services" className="text-gray-700 hover:text-orange-600 font-medium text-sm">Services</a>
          <a href="#booking" className="text-gray-700 hover:text-orange-600 font-medium text-sm">Book</a>
          <a href="#contact" className="text-gray-700 hover:text-orange-600 font-medium text-sm">Contact</a>
        </nav>

        {/* Far RIGHT: auth buttons (desktop) + hamburger (mobile) */}
        <div className="flex items-center gap-2 pr-2 flex-shrink-0">

          {/* Hello greeting — always visible when authenticated */}
          {isAuthenticated && (
            <div className="flex flex-col text-right leading-tight mr-1">
              <span className="text-sm font-semibold text-gray-900">Hello, {user?.role === 'admin' ? 'Admin' : user?.name}</span>
              <span className="text-xs text-gray-600">{user?.role === 'admin' ? 'Administrator' : 'Patient'}</span>
            </div>
          )}

          {/* Auth buttons — desktop only */}
          <div className="hidden md:flex items-center gap-2">
            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  {user?.role === 'admin' && (
                    <button
                      type="button"
                      onClick={onAdminToggle}
                      className="bg-blue-600 text-white px-2 py-1 rounded-md text-sm hover:bg-blue-700 transition-colors flex items-center gap-1"
                    >
                      <Settings className="h-4 w-4" />
                      <span>Admin</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onLogout}
                    className="bg-gray-600 text-white px-2 py-1 rounded-md text-sm hover:bg-gray-700 transition-colors flex items-center gap-1"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Logout</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onSignIn}
                  className="text-gray-700 hover:text-orange-600 text-sm px-2 py-1"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={onSignUp}
                  className="bg-orange-600 text-white px-3 py-1 rounded-md text-sm hover:bg-orange-700"
                >
                  Sign Up
                </button>
              </>
            )}
          </div>

          {/* Hamburger button — mobile only */}
          <button
            type="button"
            className="md:hidden p-2 rounded hover:bg-gray-100"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen
              ? <X className="h-5 w-5 text-gray-700" />
              : <Menu className="h-5 w-5 text-gray-700" />
            }
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden bg-white border-t border-gray-200 shadow-lg px-4 py-4 flex flex-col gap-3">

          {/* Nav links */}
          <a href="#home" onClick={closeMenu} className="text-gray-700 hover:text-orange-600 font-medium py-2 border-b border-gray-100">Home</a>
          <a href="#services" onClick={closeMenu} className="text-gray-700 hover:text-orange-600 font-medium py-2 border-b border-gray-100">Services</a>
          <a href="#booking" onClick={closeMenu} className="text-gray-700 hover:text-orange-600 font-medium py-2 border-b border-gray-100">Book</a>
          <a href="#contact" onClick={closeMenu} className="text-gray-700 hover:text-orange-600 font-medium py-2 border-b border-gray-100">Contact</a>

          {/* Auth section */}
          {isAuthenticated ? (
            <div className="pt-2 flex flex-col gap-2">
              {user?.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => { onAdminToggle?.(); closeMenu(); }}
                  className="w-full bg-blue-600 text-white py-2 rounded-md text-sm hover:bg-blue-700 flex items-center justify-center gap-2"
                >
                  <Settings className="h-4 w-4" />
                  Admin Panel
                </button>
              )}
              <button
                type="button"
                onClick={() => { onLogout?.(); closeMenu(); }}
                className="w-full bg-gray-600 text-white py-2 rounded-md text-sm hover:bg-gray-700 flex items-center justify-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          ) : (
            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => { onSignIn?.(); closeMenu(); }}
                className="w-full border border-orange-500 text-orange-600 py-2 rounded-md text-sm hover:bg-orange-50"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { onSignUp?.(); closeMenu(); }}
                className="w-full bg-orange-600 text-white py-2 rounded-md text-sm hover:bg-orange-700"
              >
                Sign Up
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
};

export default Header;
