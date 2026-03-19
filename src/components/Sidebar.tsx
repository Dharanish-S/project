import { useState, useEffect } from 'react';
import { User } from '../types';
import { X, LogOut, User as UserIcon, Wallet, Download, MessageSquare, Loader2, CheckCircle2, Server } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  type: 'customer' | 'merchant';
}

export default function Sidebar({ isOpen, onClose, user, type }: SidebarProps) {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [pendingSms, setPendingSms] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    
    // Load pending SMS for simulation
    const loadPending = () => {
      const pending = JSON.parse(localStorage.getItem('zpay_pending_tx') || '[]');
      setPendingSms(pending);
    };
    
    loadPending();
    const interval = setInterval(loadPending, 2000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      clearInterval(interval);
    };
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      setShowInstallGuide(true);
    }
  };

  const handleProcessSms = async (tx: any, index: number) => {
    if (!navigator.onLine) {
      console.error('The SMS Gateway Simulator needs internet to reach the Main Server.');
      return;
    }

    setIsProcessing(tx.timestamp);
    try {
      const gatewayPayload = {
        sender: tx.sender_phone,
        message: `PAY ${tx.sender_phone} ${tx.amount} ${tx.receiver_phone} ${tx.pin}`
      };

      // Send to our backend proxy, which will forward it to the external SMS Gateway
      const res = await fetch('/api/send-to-gateway', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gatewayPayload),
      });
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Invalid response from gateway");
      }
      
      if (res.ok) {
        // Remove from pending
        const pending = JSON.parse(localStorage.getItem('zpay_pending_tx') || '[]');
        const updated = pending.filter((_: any, i: number) => i !== index);
        localStorage.setItem('zpay_pending_tx', JSON.stringify(updated));
        setPendingSms(updated);
        
        // Update local balance if this is the current user
        if (user && user.phone === tx.sender_phone) {
          // Note: The parent component will refresh balance via its own interval
        }
      } else {
        console.error('Gateway failed to process SMS');
      }
    } catch (err) {
      console.error('Network error reaching Main Server');
    } finally {
      setIsProcessing(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('zpay_session');
    navigate('/');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />
      <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white shadow-xl">
        <div className="absolute top-0 right-0 -mr-12 pt-2">
          <button
            type="button"
            className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
            onClick={onClose}
          >
            <span className="sr-only">Close sidebar</span>
            <X className="h-6 w-6 text-white" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
          <div className="flex-shrink-0 flex items-center px-4">
            <div className="h-16 w-16 rounded-full bg-indigo-100 flex items-center justify-center border-2 border-indigo-500">
              <UserIcon className="h-8 w-8 text-indigo-600" />
            </div>
          </div>
          <div className="mt-4 px-4">
            <h2 className="text-xl font-bold text-gray-900">{user?.name}</h2>
            <p className="text-sm text-gray-500 font-medium">{user?.phone}</p>
          </div>

          <nav className="mt-8 px-2 space-y-1">
            <div className="group flex items-center px-2 py-3 text-base font-medium rounded-md text-gray-900 hover:bg-gray-50 hover:text-gray-900">
              <Wallet className="mr-4 h-6 w-6 text-gray-400 group-hover:text-gray-500" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-500">Wallet Balance</p>
                <p className="text-lg font-bold">₹{user?.balance}</p>
              </div>
            </div>

            <button
              onClick={handleInstall}
              className="w-full mt-4 group flex items-center px-2 py-3 text-base font-medium rounded-md text-green-600 hover:bg-green-50"
            >
              <Download className="mr-4 h-6 w-6 text-green-500" />
              Add to Home Screen
            </button>

          </nav>
        </div>
        <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
          <button
            onClick={handleLogout}
            className="flex-shrink-0 w-full group block text-red-600 hover:bg-red-50 rounded-md p-2 transition-colors"
          >
            <div className="flex items-center">
              <LogOut className="inline-block h-5 w-5 mr-3" />
              <p className="text-base font-medium">Logout</p>
            </div>
          </button>
        </div>
      </div>

      {/* Install Guide Modal */}
      {showInstallGuide && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Install ZPay</h3>
            <p className="text-sm text-gray-600 mb-4">
              To install ZPay on your phone for quick access:
            </p>
            <div className="space-y-4 mb-6">
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                <p className="text-sm font-semibold text-gray-800 mb-1">iPhone / iPad (Safari)</p>
                <p className="text-xs text-gray-600">
                  Tap the <strong>Share</strong> button at the bottom of the screen, then scroll down and tap <strong>"Add to Home Screen"</strong>.
                </p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                <p className="text-sm font-semibold text-gray-800 mb-1">Android (Chrome)</p>
                <p className="text-xs text-gray-600">
                  Tap the <strong>Menu</strong> button (three dots) at the top right, then tap <strong>"Add to Home screen"</strong> or <strong>"Install app"</strong>.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowInstallGuide(false)}
              className="w-full bg-indigo-600 text-white rounded-xl py-3 font-semibold hover:bg-indigo-700 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
