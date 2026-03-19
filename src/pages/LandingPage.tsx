import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, Download } from 'lucide-react';

export default function LandingPage() {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      console.log('beforeinstallprompt event fired');
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowInstallBtn(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      console.log('Please use your browser menu (3 dots or Share) to "Install App" or "Add to Home Screen".');
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBtn(false);
    }
    setDeferredPrompt(null);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-white">
      <div className="flex flex-col items-center mb-12 text-center">
        <div className="w-24 h-24 bg-indigo-600 rounded-full flex items-center justify-center mb-4 shadow-lg">
          <Wallet className="w-12 h-12 text-white" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 tracking-tight">ZPay</h1>
        <p className="text-gray-500 mt-2 text-sm">Fast, Secure, Offline Payments</p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        <button
          onClick={() => navigate('/login/customer')}
          className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-lg transition-colors shadow-md"
        >
          Customer App
        </button>
        <button
          onClick={() => navigate('/login/merchant')}
          className="w-full py-4 px-6 bg-white border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50 rounded-xl font-semibold text-lg transition-colors shadow-sm"
        >
          Merchant App
        </button>
        <button
          onClick={() => navigate('/admin/sms-gateway')}
          className="w-full py-4 px-6 bg-gray-800 hover:bg-gray-900 text-white rounded-xl font-semibold text-lg transition-colors shadow-sm"
        >
          SMS Gateway Dashboard
        </button>

        {showInstallBtn ? (
          <button
            onClick={handleInstall}
            className="w-full py-3 px-6 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-semibold text-md transition-colors shadow-sm flex items-center justify-center gap-2 mt-4 animate-pulse"
          >
            <Download className="w-5 h-5" />
            Install ZPay App
          </button>
        ) : (
          <p className="text-center text-xs text-gray-400 mt-4">
            Tip: For the best experience, use Chrome (Android) or Safari (iOS) and select "Install App" from the menu.
          </p>
        )}
      </div>
    </div>
  );
}
