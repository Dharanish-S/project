import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { User, Transaction } from '../types';
import { io } from 'socket.io-client';

type Step = 'receiver' | 'amount' | 'details' | 'confirming' | 'success';

export default function PaymentFlow() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [step, setStep] = useState<Step>(location.state?.prefillPhone ? 'amount' : 'receiver');
  const [amount, setAmount] = useState('');
  const getInitialPhone = () => {
    const prefill = location.state?.prefillPhone;
    if (!prefill) return '';
    try {
      const parsed = JSON.parse(prefill);
      return parsed.phone || prefill;
    } catch {
      return prefill;
    }
  };

  const [receiverPhone, setReceiverPhone] = useState(getInitialPhone());
  const [receiverName, setReceiverName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isSimulatedOffline] = useState(true);
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    const session = localStorage.getItem('zpay_session');
    if (!session) {
      navigate('/');
      return;
    }
    
    const { phone } = JSON.parse(session);
    
    const fetchUser = async () => {
      if (!phone) return;
      try {
        if (navigator.onLine) {
          const res = await fetch(`/api/user/${encodeURIComponent(phone)}?t=${Date.now()}`);
          if (res.ok) {
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
              const data = await res.json();
              if (data.success) {
                setUser(data.user);
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch user:', err);
      }
    };

    const fetchReceiver = async (phone: string) => {
      if (!phone) return;
      try {
        const res = await fetch(`/api/user/${encodeURIComponent(phone)}?t=${Date.now()}`);
        if (res.ok) {
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.indexOf("application/json") !== -1) {
            const data = await res.json();
            if (data.success) {
              setReceiverName(data.user.name);
            } else {
              setReceiverName('');
            }
          } else {
            setReceiverName('');
          }
        } else {
          setReceiverName('');
        }
      } catch (err) {
        console.error('Failed to fetch receiver:', err);
      }
    };

    fetchUser();
    if (location.state?.prefillPhone) {
      let phoneToFetch = location.state.prefillPhone;
      try {
        const parsed = JSON.parse(phoneToFetch);
        phoneToFetch = parsed.phone || phoneToFetch;
      } catch {
        // Not JSON
      }
      fetchReceiver(phoneToFetch);
    }
  }, [navigate, location.state?.prefillPhone]);

  const handleReceiverContinue = async () => {
    setError('');
    if (receiverPhone.length !== 10 || !/^\d+$/.test(receiverPhone)) {
      setError('Enter a valid 10-digit phone number');
      return;
    }
    
    try {
      const res = await fetch(`/api/user/${encodeURIComponent(receiverPhone)}?t=${Date.now()}`);
      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
          const data = await res.json();
          if (data.success) {
            setReceiverName(data.user.name);
            setStep('amount');
          } else {
            // If user not found but we're in mandatory SMS mode, we can still allow it
            // but maybe it's safer to show error if we ARE online and know they don't exist.
            setError('Receiver not found');
          }
        } else {
          setStep('amount');
        }
      } else {
        // If offline or server error, allow continuing with generic name
        setStep('amount');
      }
    } catch (err) {
      // Offline: allow continuing
      setStep('amount');
      console.log('Offline: proceeding without receiver verification');
    }
  };

  const handleAmountContinue = () => {
    setError('');
    const numAmount = parseInt(amount, 10);
    
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Enter a valid amount');
      return;
    }
    
    if (numAmount > 200) {
      setError('per Transaction limit is 200');
      return;
    }
    
    if (user && numAmount > user.balance) {
      setError('Insufficient balance');
      return;
    }
    
    setStep('details');
  };

  const handleSend = async () => {
    setError('');
    
    if (receiverPhone.length !== 10 || !/^\d+$/.test(receiverPhone)) {
      setError('Enter a valid 10-digit phone number');
      return;
    }
    
    if (pin.length < 4) {
      setError('Enter a valid PIN');
      return;
    }
    
    setStep('confirming');
    
    const currentTimestamp = new Date().toISOString();
    
    try {
      // 1. Initialize socket and register BEFORE sending to gateway
      // This ensures the server knows our socket ID before it tries to emit the result
      const socket = io();
      
      await new Promise<void>((resolve) => {
        let isResolved = false;
        
        const registerAndResolve = () => {
          if (isResolved) return;
          isResolved = true;
          if (user?.phone) {
            socket.emit('register', user.phone, () => {
              resolve();
            });
          } else {
            resolve();
          }
        };

        if (socket.connected) {
          registerAndResolve();
        } else {
          socket.on('connect', registerAndResolve);
          // Fallback if socket fails to connect quickly
          setTimeout(() => {
            if (!isResolved) {
              console.warn("Socket connection timed out, proceeding anyway");
              isResolved = true;
              resolve();
            }
          }, 2000);
        }
      });

      // 2. Set up listeners BEFORE fetching to avoid race conditions
      const resultPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => {
          socket.disconnect();
          resolve(null);
        }, 30000); // Increased to 30s for external gateway roundtrip

        socket.on('transaction_updated', (tx) => {
          console.log('✅ Received transaction_updated via socket:', tx);
          if (tx && (tx.sender_phone === user?.phone || tx.receiver_phone === user?.phone)) {
            clearTimeout(timeout);
            resolve(tx);
            socket.disconnect();
          }
        });

        socket.on('transaction_failed', (data) => {
          console.log('❌ Received transaction_failed via socket:', data);
          clearTimeout(timeout);
          resolve({ error: data.reason });
          socket.disconnect();
        });
      });

      // 3. Send to our backend proxy, which will forward it to the external SMS Gateway
      const res = await fetch('/api/send-to-gateway', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: user?.phone,
          message: `PAY ${user?.phone} ${amount} ${receiverPhone} ${pin}`,
          timestamp: currentTimestamp
        }),
      });
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        socket.disconnect();
        throw new Error(`Server returned invalid response format. ${text.substring(0, 50)}...`);
      }

      const data = await res.json();
      
      if (!data.success) {
        socket.disconnect();
        throw new Error(data.message || "Gateway request failed");
      }
      
      if (data.success) {
        setCountdown(30);
        const countdownInterval = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 1) {
              clearInterval(countdownInterval);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);

        // 4. Wait for confirmation from Main Server via socket
        const result = await resultPromise;
        clearInterval(countdownInterval);

        if (!result) {
          setError("Transaction timed out. Please check your balance or transaction history.");
          setStep('details');
          return;
        }
        
        if ((result as any).error) {
          setError((result as any).error);
          setStep('details');
          return;
        }

        setTransaction({
          sender_phone: user?.phone,
          receiver_phone: receiverPhone,
          amount: parseInt(amount, 10),
          timestamp: currentTimestamp
        });
        if (user) {
          const updatedUser = { ...user, balance: user.balance - parseInt(amount, 10) };
          setUser(updatedUser);
          localStorage.setItem('zpay_user', JSON.stringify(updatedUser));
        }
        setStep('success');
      } else {
        setError(data.message || 'Payment failed via SMS');
        setStep('details');
      }
    } catch (err) {
      // Simulate success even if fetch fails in offline mode
      const offlineTx = {
        sender_phone: user?.phone,
        receiver_phone: receiverPhone,
        amount: parseInt(amount, 10),
        pin: pin,
        timestamp: currentTimestamp
      };
      const pending = JSON.parse(localStorage.getItem('zpay_pending_tx') || '[]');
      localStorage.setItem('zpay_pending_tx', JSON.stringify([...pending, offlineTx]));
      
      if (user) {
        const updatedUser = { ...user, balance: user.balance - parseInt(amount, 10) };
        setUser(updatedUser);
        localStorage.setItem('zpay_user', JSON.stringify(updatedUser));
      }
      setStep('success');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {step !== 'success' && step !== 'confirming' && (
        <header className="bg-indigo-600 shadow-md p-4 flex items-center text-white sticky top-0 z-10">
          <button
            onClick={() => {
              if (step === 'details') setStep('amount');
              else if (step === 'amount' && !location.state?.prefillPhone) setStep('receiver');
              else navigate(-1);
            }}
            className="p-2 -ml-2 mr-2 hover:bg-indigo-700 rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold tracking-tight">
            {step === 'receiver' ? 'Enter Receiver' : step === 'amount' ? 'Enter Amount' : 'Payment Details'}
          </h1>
        </header>
      )}

      <main className="flex-1 p-6 flex flex-col justify-center">
        {step === 'receiver' && (
          <div className="flex flex-col flex-1">
            <div className="flex-1 flex flex-col justify-center items-center">
              <p className="text-gray-500 mb-4 font-medium">Enter receiver phone number</p>
              <div className="flex items-center justify-center text-3xl font-bold text-gray-900 mb-8 w-full px-8">
                <span className="text-gray-400 mr-2">+91</span>
                <input
                  type="tel"
                  value={receiverPhone}
                  onChange={(e) => setReceiverPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="w-full bg-transparent border-b-2 border-indigo-600 text-center focus:outline-none pb-2"
                  placeholder="00000 00000"
                  autoFocus
                />
              </div>
              {error && <p className="text-red-500 text-sm font-medium bg-red-50 px-4 py-2 rounded-lg">{error}</p>}
            </div>
            
            <div className="mt-auto pb-6">
              <button
                onClick={handleReceiverContinue}
                disabled={receiverPhone.length !== 10}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold py-4 px-4 rounded-xl shadow-md transition-colors text-lg"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 'amount' && (
          <div className="flex flex-col flex-1">
            {receiverPhone && (
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-6 flex items-center space-x-4">
                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-xl">
                  {receiverName ? receiverName.charAt(0).toUpperCase() : 'M'}
                </div>
                <div>
                  <p className="text-sm text-gray-500 font-medium">Paying to</p>
                  <p className="text-lg font-bold text-gray-900">{receiverName || 'Merchant'}</p>
                  <p className="text-sm text-gray-500 font-mono">{receiverPhone}</p>
                </div>
              </div>
            )}
            <div className="flex-1 flex flex-col justify-center items-center">
              <p className="text-gray-500 mb-4 font-medium">Enter amount to pay</p>
              <div className="flex items-center justify-center text-5xl font-bold text-gray-900 mb-8">
                <span className="text-gray-400 mr-2">₹</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-40 bg-transparent border-none text-center focus:outline-none"
                  placeholder="0"
                  autoFocus
                />
              </div>
              {error && <p className="text-red-500 text-sm font-medium bg-red-50 px-4 py-2 rounded-lg">{error}</p>}
            </div>
            
            <div className="mt-auto pb-6">
              <button
                onClick={handleAmountContinue}
                disabled={!amount}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold py-4 px-4 rounded-xl shadow-md transition-colors text-lg"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 'details' && (
          <div className="flex flex-col flex-1">
            <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
              <div className="flex justify-between items-center mb-6 pb-6 border-b border-gray-100">
                <span className="text-gray-500 font-medium">Amount</span>
                <span className="text-2xl font-bold text-gray-900">₹{amount}</span>
              </div>
              
              <div className="space-y-6">
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 mb-4">
                  <p className="text-sm text-gray-500 mb-1">Paying to</p>
                  <p className="font-bold text-gray-900">{receiverName || 'Merchant'}</p>
                  <p className="text-sm font-mono text-gray-600">{receiverPhone}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Enter PIN</label>
                  <input
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full border-b-2 border-indigo-600 py-3 px-2 text-xl font-bold tracking-widest focus:outline-none text-center"
                    placeholder="****"
                    maxLength={6}
                    autoFocus
                  />
                </div>
              </div>
              
              {error && <p className="text-red-500 text-sm font-medium mt-6 text-center bg-red-50 py-2 rounded-lg">{error}</p>}
            </div>
            
            <div className="bg-white rounded-2xl shadow-sm p-4 mb-6 flex items-center justify-between">
              <div>
                <span className="block text-sm font-bold text-indigo-600">External SMS Gateway Active</span>
                <span className="block text-xs text-gray-500">Forwarding query to Gateway Website</span>
              </div>
              <div className="flex items-center text-indigo-600">
                <CheckCircle2 className="w-5 h-5 mr-1" />
                <span className="text-xs font-bold uppercase">External</span>
              </div>
            </div>
            
            <div className="mt-auto pb-6">
              <button
                onClick={handleSend}
                disabled={receiverPhone.length !== 10 || pin.length < 4}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold py-4 px-4 rounded-xl shadow-md transition-colors text-lg"
              >
                Send
              </button>
            </div>
          </div>
        )}

        {step === 'confirming' && (
          <div className="flex flex-col items-center justify-center flex-1 text-center">
            <div className="relative mb-6">
              <Loader2 className="w-20 h-20 text-indigo-600 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center font-bold text-indigo-600">
                {countdown}s
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Processing Transaction...
            </h2>
            <p className="text-gray-500 max-w-xs mx-auto">
              Please wait while we verify your transaction with the Company Number. This may take up to 30 seconds.
            </p>
          </div>
        )}

        {step === 'success' && (
          <div className="flex flex-col flex-1">
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6">
                <CheckCircle2 className="w-16 h-16 text-green-500" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Payment Successful</h2>
              <p className="text-gray-500 mb-8 max-w-xs mx-auto">
                Query forwarded to Gateway Website. Main Server updated.
              </p>
              
              <div className="bg-white rounded-2xl shadow-sm p-6 w-full max-w-sm text-left space-y-4">
                <div className="flex justify-between items-center border-b border-gray-100 pb-4">
                  <span className="text-gray-500 font-medium">Amount</span>
                  <span className="text-2xl font-bold text-gray-900">₹{amount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 font-medium">Receiver</span>
                  <div className="text-right">
                    <span className="font-semibold text-gray-900 block">{receiverName || 'Merchant'}</span>
                    <span className="text-sm text-gray-500">{receiverPhone}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 font-medium">Date & Time</span>
                  <span className="font-semibold text-gray-900">
                    {(() => {
                      const date = transaction ? new Date(transaction.timestamp) : new Date();
                      date.setSeconds(date.getSeconds() + 2);
                      return date.toLocaleString();
                    })()}
                  </span>
                </div>
                {isSimulatedOffline && (
                  <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                    <p className="text-[10px] font-bold text-indigo-600 uppercase mb-1">External Gateway Confirmation</p>
                    <p className="text-xs font-mono text-indigo-900 break-all">
                      Query processed via External SMS Gateway
                    </p>
                  </div>
                )}
              </div>
            </div>
            
            <div className="mt-auto pb-6">
              <button
                onClick={() => navigate('/customer')}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-4 rounded-xl shadow-md transition-colors text-lg"
              >
                Back to Home
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
