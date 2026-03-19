/*
import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, Image as ImageIcon, X } from 'lucide-react';

interface QRScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export default function QRScanner({ onScan, onClose }: QRScannerProps) {
  return <div>QR Scanner Disabled for Debugging</div>;
}
*/
export default function QRScanner({ onScan, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="bg-white p-6 rounded-xl">
        <p>QR Scanner is temporarily disabled for debugging.</p>
        <button onClick={onClose} className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded">Close</button>
      </div>
    </div>
  );
}
