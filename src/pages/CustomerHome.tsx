import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Search, Wallet, QrCode, Users, Building, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { User, Transaction } from '../types';
import { io } from 'socket.io-client';

export default function CustomerHome() {
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const fetchUserData = useCallback(async () => {
    const session = localStorage.getItem('zpay_session');
    if (!session) return;
    const { phone } = JSON.parse(session);

    // Load from cache first
    const cachedUser = localStorage.getItem(`zpay_user_${phone}`);
    const cachedTransactions = localStorage.getItem(`zpay_tx_${phone}`);
    
    if (cachedUser) setUser(JSON.parse(cachedUser));
    if (cachedTransactions) setTransactions(JSON.parse(cachedTransactions));

    try {
      const res = await fetch(`/api/user/${phone}?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setUser(data.user);
          localStorage.setItem(`zpay_user_${phone}`, JSON.stringify(data.user));
        }
      }
      
      const txRes = await fetch(`/api/transactions/${phone}?t=${Date.now()}`);
      if (txRes.ok) {
        const txData = await txRes.json();
        if (txData.success) {
          setTransactions(txData.transactions);
          localStorage.setItem(`zpay_tx_${phone}`, JSON.stringify(txData.transactions));
        }
      }
    } catch (err) {
      console.error('Server sync failed:', err);
    }
  }, []);

  useEffect(() => {
    const session = localStorage.getItem('zpay_session');
    if (!session) {
      navigate('/');
      return;
    }

    const { phone } = JSON.parse(session);
    const socket = io();

    socket.on('connect', () => {
      socket.emit('register', phone);
    });

    socket.on('transaction_updated', fetchUserData);

    fetchUserData();

    return () => {
      socket.disconnect();
    };
  }, [navigate, fetchUserData]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        user={user}
        type="customer"
      />

      <header className="bg-indigo-600 shadow-md p-4 flex items-center justify-between text-white sticky top-0 z-10">
        <div className="flex items-center">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 -ml-2 mr-2 hover:bg-indigo-700 rounded-full transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold tracking-tight">ZPay</h1>
        </div>
        <div className="w-10 h-10 bg-indigo-500 rounded-full flex items-center justify-center font-bold text-lg border-2 border-indigo-400">
          {user?.name.charAt(0).toUpperCase()}
        </div>
      </header>

      <main className="flex-1 p-4 space-y-6">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm shadow-sm"
            placeholder="Search contacts, businesses..."
            onClick={() => alert('Search is just for show')}
          />
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => navigate('/customer/pay')}
              className="flex items-center p-4 bg-indigo-50 rounded-2xl group hover:bg-indigo-100 transition-colors"
            >
              <div className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center mr-4">
                <Wallet className="w-6 h-6" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-gray-900">Pay by Wallet</p>
                <p className="text-xs text-gray-500">Fast & Secure</p>
              </div>
            </button>

            <button
              onClick={() => alert('Feature coming soon')}
              className="flex items-center p-4 bg-green-50 rounded-2xl group hover:bg-green-100 transition-colors"
            >
              <div className="w-12 h-12 bg-green-600 text-white rounded-xl flex items-center justify-center mr-4">
                <QrCode className="w-6 h-6" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-gray-900">Scan QR</p>
                <p className="text-xs text-gray-500">Pay Merchants</p>
              </div>
            </button>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-900">Recent Transactions</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {transactions.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No transactions yet</div>
            ) : (
              transactions.map((tx) => {
                const isReceived = tx.receiver_phone === user?.phone;
                return (
                  <div key={tx.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center ${
                          isReceived ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                        }`}
                      >
                        {isReceived ? <ArrowDownLeft className="w-6 h-6" /> : <ArrowUpRight className="w-6 h-6" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {isReceived ? `From ${tx.sender_phone}` : `To ${tx.receiver_phone}`}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {new Date(tx.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className={`text-base font-bold ${isReceived ? 'text-green-600' : 'text-gray-900'}`}>
                      {isReceived ? '+' : '-'}₹{tx.amount}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
