import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import 'bootstrap/dist/css/bootstrap.min.css';
import { auth } from './firebase';
import DoctorDashboard from './pages/DoctorDashboard';
import Login from './pages/Login';

function App() {
  const [user, setUser] = useState(undefined); // undefined = still checking, null = signed out

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (user === undefined) {
    return <div className="p-4 text-center">Loading…</div>;
  }

  if (!user) {
    return <Login />;
  }

  return (
    <>
      <div className="d-flex justify-content-end p-2 border-bottom bg-white">
        <span className="text-muted small me-3 align-self-center">{user.email}</span>
        <button className="btn btn-sm btn-outline-secondary" onClick={() => signOut(auth)}>
          Log out
        </button>
      </div>
      <DoctorDashboard />
    </>
  );
}

export default App;
