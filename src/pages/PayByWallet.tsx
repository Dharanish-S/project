import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wallet, ArrowDownLeft, ArrowUpRight, QrCode, Phone } from 'lucide-react';
import { User, Transaction } from '../types';
import QRScanner from '../components/QRScanner';

export default function PayByWallet() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showOptions, setShowOptions] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('zpay_user');
    if (!storedUser) {
      navigate('/');
      return;
    }
    
    const parsedUser = JSON.parse(storedUser);
    setUser(parsedUser);
    
    // Load cached transactions immediately
    const cachedTxs = localStorage.getItem(`zpay_txs_${parsedUser.phone}`);
    if (cachedTxs) {
      setTransactions(JSON.parse(cachedTxs));
    }
    
    fetchTransactions(parsedUser.phone);

    const fetchUserData = async () => {
      try {
        if (!navigator.onLine) return;

        let pending = JSON.parse(localStorage.getItem('zpay_pending_tx') || '[]');
        if (pending.length > 0) {
          // Sync pending transactions
          localStorage.removeItem('zpay_pending_tx');
          const remaining = [];
          for (const tx of pending) {
            try {
              const res = await fetch('/api/pay', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tx),
              });
              if (!res.ok) remaining.push(tx);
            } catch (e) {
              remaining.push(tx);
            }
          }
          if (remaining.length > 0) {
            const currentPending = JSON.parse(localStorage.getItem('zpay_pending_tx') || '[]');
            localStorage.setItem('zpay_pending_tx', JSON.stringify([...currentPending, ...remaining]));
            return; // Don't fetch user data if there are still pending txs
          }
        }

        if (parsedUser.phone) {
          const res = await fetch(`/api/user/${encodeURIComponent(parsedUser.phone)}`);
          if (res.ok) {
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
              const data = await res.json();
              if (data.success) {
                setUser(data.user);
                localStorage.setItem('zpay_user', JSON.stringify(data.user));
              }
            }
          }
        }
        
        // Also fetch transactions
        fetchTransactions(parsedUser.phone);
      } catch (err) {
        // Ignore offline errors
      }
    };

    const interval = setInterval(fetchUserData, 5000);
    fetchUserData();
    return () => clearInterval(interval);
  }, [navigate]);

  const fetchTransactions = async (phone: string) => {
    if (!phone || !navigator.onLine) return;
    try {
      const res = await fetch(`/api/transactions/${encodeURIComponent(phone)}`);
      if (!res.ok) return;
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const data = await res.json();
        if (data.success) {
          setTransactions(data.transactions);
          // Also update cache here to keep it in sync
          localStorage.setItem(`zpay_txs_${phone}`, JSON.stringify(data.transactions));
        }
      }
    } catch (err) {
      // Silently fail if offline or network error
    }
  };

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
        {isScanning && (
          <QRScanner
            onScan={(text) => {
              setIsScanning(false);
              navigate('/customer/pay/flow', { state: { prefillPhone: text } });
            }}
            onClose={() => setIsScanning(false)}
          />
        )}

        {showOptions && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowOptions(false)}>
            <div 
              className="bg-white rounded-t-3xl w-full max-w-md p-6 animate-in slide-in-from-bottom-full duration-300"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-6"></div>
              <h2 className="text-xl font-bold text-gray-900 mb-6 text-center">Choose Payment Method</h2>
              
              <div className="space-y-4">
                <button
                  onClick={() => {
                    setShowOptions(false);
                    navigate('/customer/pay/flow');
                  }}
                  className="w-full flex items-center p-4 bg-gray-50 hover:bg-indigo-50 rounded-2xl transition-colors border border-gray-100 group"
                >
                  <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mr-4 group-hover:bg-indigo-200 transition-colors">
                    <Phone className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-bold text-gray-900">Enter Receiver Number</h3>
                    <p className="text-sm text-gray-500">Pay using 10-digit mobile number</p>
                  </div>
                </button>
                
                <button
                  onClick={() => {
                    setShowOptions(false);
                    setIsScanning(true);
                  }}
                  className="w-full flex items-center p-4 bg-gray-50 hover:bg-blue-50 rounded-2xl transition-colors border border-gray-100 group"
                >
                  <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mr-4 group-hover:bg-blue-200 transition-colors">
                    <QrCode className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-bold text-gray-900">Scan QR Code</h3>
                    <p className="text-sm text-gray-500">Scan to pay instantly</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl shadow-md p-6 text-white relative overflow-hidden flex flex-col items-center justify-center text-center">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white opacity-10 rounded-full blur-xl"></div>
          <Wallet className="w-10 h-10 mb-3 opacity-90" />
          <h3 className="text-sm font-medium opacity-90 mb-1">Wallet Balance</h3>
          <p className="text-4xl font-bold tracking-tight mb-6">₹{user?.balance}</p>
          
          <button
            onClick={() => setShowOptions(true)}
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
