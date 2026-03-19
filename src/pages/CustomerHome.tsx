import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Search, Wallet, QrCode, Users, Building, ArrowDownLeft, ArrowUpRight, RefreshCw } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import QRScanner from '../components/QRScanner';
import { User, Transaction } from '../types';
import { io } from 'socket.io-client';

export default function CustomerHome() {
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchTransactions = async (phone: string) => {
    if (!phone) return;
    try {
      const res = await fetch(`/api/transactions/${encodeURIComponent(phone)}`);
      if (!res.ok) return;
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const data = await res.json();
        if (data.success) {
          setTransactions(data.transactions);
          localStorage.setItem(`zpay_txs_${phone}`, JSON.stringify(data.transactions));
        }
      }
    } catch (err) {
      // Silently fail
    }
  };

  const fetchUserData = async (phone: string) => {
    try {
      if (!phone) return;
      const res = await fetch(`/api/user/${encodeURIComponent(phone)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setUser(data.user);
          localStorage.setItem('zpay_user', JSON.stringify(data.user));
        }
      }
      fetchTransactions(phone);
    } catch (err) {
      // Ignore
    }
  };

  useEffect(() => {
    const storedUser = localStorage.getItem('zpay_user');
    if (!storedUser) {
      navigate('/');
      return;
    }
    
    const parsedUser = JSON.parse(storedUser);
    setUser(parsedUser);

    const socket = io();
    socket.on('connect', () => {
      console.log('Connected to server via Socket.io');
      socket.emit('register', parsedUser.phone);
    });

    socket.on('transaction_updated', () => {
      console.log('Transaction update received via socket!');
      fetchUserData(parsedUser.phone);
    });

    // Initial fetch
    fetchUserData(parsedUser.phone);

    // Polling as fallback
    const interval = setInterval(() => fetchUserData(parsedUser.phone), 10000);

    return () => {
      socket.disconnect();
      clearInterval(interval);
    };
  }, [navigate]);

  const handleManualRefresh = async () => {
    if (!user) return;
    setIsRefreshing(true);
    await fetchUserData(user.phone);
    setTimeout(() => setIsRefreshing(false), 500);
  };

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
        <div className="flex items-center">
          <button
            onClick={handleManualRefresh}
            className={`p-2 mr-2 hover:bg-indigo-700 rounded-full transition-colors ${isRefreshing ? 'animate-spin' : ''}`}
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 bg-indigo-500 rounded-full flex items-center justify-center font-bold text-lg border-2 border-indigo-400">
            {user?.name.charAt(0).toUpperCase()}
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 space-y-6">
        {isScanning && (
          <QRScanner
            onScan={(text) => {
              setIsScanning(false);
              // Assuming the QR code contains the merchant's phone number
              navigate('/customer/pay/flow', { state: { prefillPhone: text } });
            }}
            onClose={() => setIsScanning(false)}
          />
        )}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm shadow-sm"
            placeholder="Search contacts, businesses..."
            onClick={() => console.log('Search is just for show')}
          />
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Transfer Money</h2>
          <div className="grid grid-cols-4 gap-4">
            <button
              onClick={() => navigate('/customer/pay')}
              className="flex flex-col items-center justify-center space-y-2 group"
            >
              <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center group-hover:bg-indigo-200 transition-colors">
                <Wallet className="w-7 h-7" />
              </div>
              <span className="text-xs font-semibold text-gray-700 text-center">Pay by Wallet</span>
            </button>

            <button
              onClick={() => setIsScanning(true)}
              className="flex flex-col items-center justify-center space-y-2 group"
            >
              <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                <QrCode className="w-7 h-7" />
              </div>
              <span className="text-xs font-semibold text-gray-700 text-center">Scan QR</span>
            </button>

            <button
              onClick={() => console.log('Anyone is just for show')}
              className="flex flex-col items-center justify-center space-y-2 group"
            >
              <div className="w-14 h-14 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center group-hover:bg-green-200 transition-colors">
                <Users className="w-7 h-7" />
              </div>
              <span className="text-xs font-semibold text-gray-700 text-center">Anyone</span>
            </button>

            <button
              onClick={() => console.log('Bank Transfer is just for show')}
              className="flex flex-col items-center justify-center space-y-2 group"
            >
              <div className="w-14 h-14 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                <Building className="w-7 h-7" />
              </div>
              <span className="text-xs font-semibold text-gray-700 text-center">Bank Transfer</span>
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
                        <div className="flex items-center space-x-2 mt-0.5">
                          <p className="text-xs text-gray-500">
                            {new Date(tx.timestamp).toLocaleString()}
                          </p>
                        </div>
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
