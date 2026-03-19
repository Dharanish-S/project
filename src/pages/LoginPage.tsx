import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function LoginPage() {
  const { type } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (phone.length !== 10 || !/^\d+$/.test(phone)) {
      setError('Enter the correct number');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();

      if (data.success) {
        localStorage.setItem('zpay_session', JSON.stringify({ phone, type: type || 'customer' }));
        localStorage.setItem('zpay_user', JSON.stringify(data.user));
        navigate(type === 'merchant' ? '/merchant' : '/customer');
      } else {
        setError(data.message || 'This number is not registered');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="p-4 flex items-center border-b border-gray-100">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-full">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-semibold ml-2">ZPay</h1>
      </div>

      <div className="flex-1 p-6 flex flex-col">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Login into {type === 'merchant' ? 'merchant' : 'customer'} account
        </h2>
        <p className="text-gray-500 mb-8">Enter your 10-digit mobile number to continue</p>

        <form onSubmit={handleLogin} className="flex flex-col flex-1">
          <div className="mb-6">
            <div className="flex items-center border-b-2 border-indigo-600 py-2">
              <span className="text-gray-500 font-medium mr-3">+91</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="appearance-none bg-transparent border-none w-full text-gray-900 mr-3 py-1 px-2 leading-tight focus:outline-none text-xl font-semibold tracking-wider"
                placeholder="00000 00000"
                autoFocus
              />
            </div>
            {error && <p className="text-red-500 text-sm mt-2 font-medium">{error}</p>}
          </div>

          <div className="mt-auto pb-6">
            <button
              type="submit"
              disabled={loading || phone.length !== 10}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold py-4 px-4 rounded-xl shadow-md transition-colors text-lg"
            >
              {loading ? 'Checking...' : 'Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
