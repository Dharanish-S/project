/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import CustomerHome from './pages/CustomerHome';
import MerchantHome from './pages/MerchantHome';
import PayByWallet from './pages/PayByWallet';
import PaymentFlow from './pages/PaymentFlow';

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login/:type" element={<LoginPage />} />
          <Route path="/customer" element={<CustomerHome />} />
          <Route path="/merchant" element={<MerchantHome />} />
          <Route path="/customer/pay" element={<PayByWallet />} />
          <Route path="/customer/pay/flow" element={<PaymentFlow />} />
        </Routes>
      </div>
    </Router>
  );
}
