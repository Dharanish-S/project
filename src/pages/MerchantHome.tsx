import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Wallet, ArrowDownLeft, ArrowUpRight, Gift, QrCode, X, RefreshCw } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import Sidebar from '../components/Sidebar';
import { User, Transaction } from '../types';
import { io } from 'socket.io-client';

export default function MerchantHome() {
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchTransactions = async (phone: string) => {
    if (!phone) return;
    try {
      const res = await fetch(`/api/transactions/${encodeURIComponent(phone)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setTransactions(data.transactions);
        localStorage.setItem(`zpay_txs_${phone}`, JSON.stringify(data.transactions));
      }
    } catch (err) {
      // Ignore
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
      socket.emit('register', parsedUser.phone);
    });

    socket.on('transaction_updated', () => {
      fetchUserData(parsedUser.phone);
    });

    fetchUserData(parsedUser.phone);
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
        type="merchant"
      />

      <header className="bg-indigo-600 shadow-md p-4 flex items-center justify-between text-white sticky top-0 z-10">
        <div className="flex items-center">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 -ml-2 mr-2 hover:bg-indigo-700 rounded-full transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold tracking-tight">ZPay Business</h1>
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
        {showQR && user && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col items-center p-6 relative">
              <button 
                onClick={() => setShowQR(false)} 
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Scan to Pay</h2>
              <p className="text-gray-500 mb-6 text-center">{user.name}</p>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <QRCodeSVG 
                  value={user.phone} 
                  size={240} 
                  level="H"
                  includeMargin={true}
                  bgColor="#ffffff"
                  fgColor="#000000"
                />
              </div>
              <p className="mt-6 text-lg font-mono font-bold tracking-widest text-indigo-600">
                {user.phone}
              </p>
            </div>
          </div>
        )}

        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-2xl shadow-lg p-6 text-white text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl"></div>
          
          <button 
            onClick={() => console.log('Referral feature coming soon!')}
            className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/30 rounded-full backdrop-blur-sm transition-colors flex items-center justify-center"
            title="Refer and Earn"
          >
            <Gift className="w-5 h-5 text-white" />
          </button>

          <Wallet className="w-10 h-10 mx-auto mb-3 opacity-80" />
          <h3 className="text-sm font-medium opacity-90 mb-1 uppercase tracking-wider">Total Balance</h3>
          <p className="text-4xl font-bold tracking-tight">₹{user?.balance}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => setShowQR(true)}
            className="bg-white p-4 rounded-2xl shadow-sm flex flex-col items-center justify-center space-y-2 hover:bg-gray-50 transition-colors border border-gray-100"
          >
            <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
              <QrCode className="w-6 h-6" />
            </div>
            <span className="font-semibold text-gray-800">Show QR</span>
          </button>
          
          <button
            onClick={() => console.log('Settlements coming soon')}
            className="bg-white p-4 rounded-2xl shadow-sm flex flex-col items-center justify-center space-y-2 hover:bg-gray-50 transition-colors border border-gray-100"
          >
            <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
              <ArrowDownLeft className="w-6 h-6" />
            </div>
            <span className="font-semibold text-gray-800">Settle Funds</span>
          </button>
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
