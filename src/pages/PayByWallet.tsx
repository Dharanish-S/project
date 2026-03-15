import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wallet, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { User, Transaction } from '../types';
import { io } from 'socket.io-client';

export default function PayByWallet() {
  const navigate = useNavigate();
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
      <header className="bg-indigo-600 shadow-md p-4 flex items-center text-white sticky top-0 z-10">
        <button
          onClick={() => navigate('/customer')}
          className="p-2 -ml-2 mr-2 hover:bg-indigo-700 rounded-full transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-bold tracking-tight">Pay by Wallet</h1>
      </header>

      <main className="flex-1 p-4 space-y-6">
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl shadow-md p-6 text-white relative overflow-hidden flex flex-col items-center justify-center text-center">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white opacity-10 rounded-full blur-xl"></div>
          <Wallet className="w-10 h-10 mb-3 opacity-90" />
          <h3 className="text-sm font-medium opacity-90 mb-1">Wallet Balance</h3>
          <p className="text-4xl font-bold tracking-tight mb-6">₹{user?.balance ?? 0}</p>
          
          <button
            onClick={() => navigate('/customer/pay/flow')}
            className="w-full max-w-xs bg-white text-indigo-600 hover:bg-gray-50 font-bold py-3 px-6 rounded-xl shadow-md transition-colors text-lg"
          >
            Pay
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900">Wallet Transaction History</h2>
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
