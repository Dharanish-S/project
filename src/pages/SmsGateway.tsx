import React, { useState, useEffect, useRef } from 'react';
import { Activity, MessageSquare, Settings, Trash2, RefreshCw, CheckCircle, XCircle, Clock, Server, Loader2 } from 'lucide-react';
import { io } from 'socket.io-client';

interface Message {
  id: string;
  from: string;
  body: string;
  status: 'received' | 'forwarded' | 'failed';
  timestamp: string;
  error?: string;
}

interface Stats {
  totalReceived: number;
  totalForwarded: number;
  totalFailed: number;
}

export default function SmsGateway() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [stats, setStats] = useState<Stats>({ totalReceived: 0, totalForwarded: 0, totalFailed: 0 });
  const [loading, setLoading] = useState(true);
  const [mainServerUrl, setMainServerUrl] = useState('');
  const [mainServerMethod, setMainServerMethod] = useState('POST');
  const [configSaved, setConfigSaved] = useState(false);
  const [isPolling, setIsPolling] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [pin, setPin] = useState('');
  const [loginError, setLoginError] = useState('');
  const [gatewayActive, setGatewayActive] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const socketRef = useRef<any>(null);

  const fetchData = async () => {
    if (!isAuthorized) return;
    try {
      const [msgRes, statsRes, statusRes] = await Promise.all([
        fetch('/api/messages'),
        fetch('/api/stats'),
        fetch('/api/gateway/status')
      ]);
      
      if (msgRes.ok) setMessages(await msgRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
      if (statusRes.ok) {
        const data = await statusRes.json();
        setGatewayActive(data.isActive);
      }
      
      setLoading(false);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');
    
    try {
      const res = await fetch('/api/gateway/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      
      if (res.ok) {
        // Simulate loading as requested
        setTimeout(async () => {
          setIsAuthorized(true);
          setIsLoggingIn(false);
          // Fetch data immediately after login
          fetchData();
          fetchConfig();
        }, 1500);
      } else {
        setIsLoggingIn(false);
        setLoginError('Invalid PIN. Please try again.');
      }
    } catch (err) {
      setIsLoggingIn(false);
      setLoginError('Connection error.');
    }
  };

  const toggleGatewayStatus = async () => {
    try {
      const newStatus = !gatewayActive;
      const res = await fetch('/api/gateway/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newStatus, pin })
      });
      if (res.ok) {
        setGatewayActive(newStatus);
      }
    } catch (err) {
      console.error("Failed to toggle gateway status:", err);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        setMainServerUrl(data.mainServerUrl);
        setMainServerMethod(data.mainServerMethod);
      }
    } catch (error) {
      console.error("Failed to fetch config:", error);
    }
  };

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mainServerUrl, mainServerMethod })
      });
      
      if (res.ok) {
        setConfigSaved(true);
        setTimeout(() => setConfigSaved(false), 3000);
      }
    } catch (error) {
      console.error("Failed to save config:", error);
    }
  };

  const clearHistory = async () => {
    try {
      const res = await fetch('/api/clear', { method: 'POST' });
      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Failed to clear history:", error);
    }
  };

  const updateMessageStatus = async (id: string, status: string, error?: string) => {
    try {
      await fetch(`/api/messages/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, error })
      });
      // Refresh data after update
      fetchData();
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  const forwardMessage = async (msg: Message) => {
    if (!mainServerUrl) {
      updateMessageStatus(msg.id, 'failed', 'Main server URL not configured');
      return;
    }

    try {
      console.log(`Forwarding message ${msg.id} to ${mainServerUrl}`);
      
      // We send the exact payload format the main server expects
      const payload = {
        sender: msg.from,
        message: msg.body
      };

      const res = await fetch(mainServerUrl, {
        method: mainServerMethod,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        updateMessageStatus(msg.id, 'forwarded');
      } else {
        const text = await res.text();
        updateMessageStatus(msg.id, 'failed', `HTTP ${res.status}: ${text.substring(0, 50)}`);
      }
    } catch (error: any) {
      updateMessageStatus(msg.id, 'failed', error.message || 'Network error');
    }
  };

  // Background watcher to forward new messages
  useEffect(() => {
    if (!isPolling) return;

    // The backend now handles auto-forwarding internally.
    // We just need to poll for updates to the message list.
  }, [messages, mainServerUrl, mainServerMethod, isPolling]);

  // Initial data fetch and polling
  useEffect(() => {
    if (isAuthorized) {
      fetchData();
      fetchConfig();
      
      // Setup Socket.io for real-time updates
      if (!socketRef.current) {
        const socket = io();
        socketRef.current = socket;
        
        socket.on('gateway_message_updated', () => {
          console.log('Real-time update: Gateway message list changed');
          fetchData();
        });
      }
    }
    
    const interval = setInterval(() => {
      if (isPolling && isAuthorized) fetchData();
    }, 10000); // Polling as fallback, but socket should handle it
    
    return () => {
      clearInterval(interval);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [isPolling, isAuthorized]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', 
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).format(date);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {!isAuthorized ? (
        <div className="flex items-center justify-center min-h-screen bg-indigo-900 px-4">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex flex-col items-center mb-8">
              <div className="bg-indigo-100 p-4 rounded-full mb-4">
                <Server className="w-12 h-12 text-indigo-600" />
              </div>
              <h1 className="text-2xl font-bold text-slate-800">SMS Gateway Login</h1>
              <p className="text-slate-500 text-center mt-2">Enter the 6-digit PIN to access the dashboard</p>
            </div>
            
            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <input
                  type="password"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Enter 6-digit PIN"
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center text-2xl tracking-widest font-mono"
                  required
                  disabled={isLoggingIn}
                />
                {loginError && <p className="mt-2 text-sm text-rose-600 text-center">{loginError}</p>}
              </div>
              
              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center justify-center"
              >
                {isLoggingIn ? (
                  <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Verifying...</>
                ) : (
                  'Access Dashboard'
                )}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <>
          {/* Header */}
          <header className="bg-indigo-600 text-white shadow-md">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <Server className="w-8 h-8 text-indigo-200" />
                <h1 className="text-2xl font-bold tracking-tight">SMS Gateway (Browser Forwarder)</h1>
              </div>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2 text-sm font-medium">
                  <span className="relative flex h-3 w-3">
                    {isPolling && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
                    <span className={`relative inline-flex rounded-full h-3 w-3 ${isPolling ? 'bg-green-500' : 'bg-slate-400'}`}></span>
                  </span>
                  <span>{isPolling ? 'Active' : 'Paused'}</span>
                </div>
                <button 
                  onClick={() => setIsPolling(!isPolling)}
                  className="bg-indigo-700 hover:bg-indigo-800 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                >
                  {isPolling ? 'Pause' : 'Resume'}
                </button>
              </div>
            </div>
          </header>

          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Left Column: Stats & Config */}
              <div className="space-y-8">
                {/* Gateway Status Control Card */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center space-x-2">
                    <Activity className="w-5 h-5 text-indigo-500" />
                    <h2 className="text-lg font-semibold text-slate-800">Gateway Control</h2>
                  </div>
                  <div className="p-6">
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <div>
                        <p className="font-semibold text-slate-800">Gateway Status</p>
                        <p className="text-sm text-slate-500">{gatewayActive ? 'Gateway is running normally' : 'Gateway is PASSED (Offline)'}</p>
                      </div>
                      <button
                        onClick={toggleGatewayStatus}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${gatewayActive ? 'bg-indigo-600' : 'bg-slate-300'}`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${gatewayActive ? 'translate-x-6' : 'translate-x-1'}`}
                        />
                      </button>
                    </div>
                    {!gatewayActive && (
                      <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                        <p><strong>Note:</strong> While the gateway is PASSED, all incoming payment queries will be queued and will not be processed until the gateway is reactivated.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Stats Card */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center space-x-2">
                    <Activity className="w-5 h-5 text-indigo-500" />
                    <h2 className="text-lg font-semibold text-slate-800">Gateway Statistics</h2>
                  </div>
                  <div className="p-6 grid grid-cols-1 gap-4">
                    <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                      <span className="text-slate-600 font-medium">Total Received</span>
                      <span className="text-2xl font-bold text-slate-800">{stats.totalReceived}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-emerald-50 rounded-lg">
                      <span className="text-emerald-700 font-medium">Successfully Forwarded</span>
                      <span className="text-2xl font-bold text-emerald-700">{stats.totalForwarded}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-rose-50 rounded-lg">
                      <span className="text-rose-700 font-medium">Failed to Forward</span>
                      <span className="text-2xl font-bold text-rose-700">{stats.totalFailed}</span>
                    </div>
                  </div>
                </div>

                {/* Configuration Card */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center space-x-2">
                    <Settings className="w-5 h-5 text-indigo-500" />
                    <h2 className="text-lg font-semibold text-slate-800">Forwarding Configuration</h2>
                  </div>
                  <div className="p-6">
                    <form onSubmit={saveConfig} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Main Server URL
                        </label>
                        <input
                          type="text"
                          value={mainServerUrl}
                          onChange={(e) => setMainServerUrl(e.target.value)}
                          placeholder="https://your-main-server.com/api/sms or /receive-query"
                          className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                          required
                        />
                        <p className="mt-1 text-xs text-slate-500">
                          The URL where incoming SMS messages will be forwarded.
                        </p>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          HTTP Method
                        </label>
                        <select
                          value={mainServerMethod}
                          onChange={(e) => setMainServerMethod(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="POST">POST</option>
                          <option value="GET">GET</option>
                        </select>
                      </div>

                      <div className="pt-2">
                        <button
                          type="submit"
                          className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors font-medium flex justify-center items-center"
                        >
                          {configSaved ? (
                            <><CheckCircle className="w-4 h-4 mr-2" /> Saved!</>
                          ) : (
                            'Save Configuration'
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>

              {/* Right Column: Message Log */}
              <div className="lg:col-span-2">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-full flex flex-col">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                      <MessageSquare className="w-5 h-5 text-indigo-500" />
                      <h2 className="text-lg font-semibold text-slate-800">Message Log</h2>
                    </div>
                    <div className="flex space-x-2">
                      <button 
                        onClick={fetchData}
                        className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                        title="Refresh"
                      >
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                      </button>
                      <button 
                        onClick={clearHistory}
                        className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                        title="Clear History"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-0 max-h-[600px]">
                    {messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <MessageSquare className="w-12 h-12 mb-3 opacity-20" />
                        <p>No messages received yet.</p>
                        <p className="text-sm mt-1">Send a POST request to /api/webhook/sms</p>
                      </div>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {messages.map((msg) => (
                          <li key={msg.id} className="p-4 hover:bg-slate-50 transition-colors">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center space-x-2">
                                <span className="font-semibold text-slate-800">{msg.from}</span>
                                <span className="text-xs text-slate-400 flex items-center">
                                  <Clock className="w-3 h-3 mr-1" />
                                  {formatDate(msg.timestamp)}
                                </span>
                              </div>
                              <div>
                                {msg.status === 'received' && (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                    <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Pending
                                  </span>
                                )}
                                {msg.status === 'forwarded' && (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                                    <CheckCircle className="w-3 h-3 mr-1" /> Forwarded
                                  </span>
                                )}
                                {msg.status === 'failed' && (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800">
                                    <XCircle className="w-3 h-3 mr-1" /> Failed
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="bg-slate-100 p-3 rounded-md font-mono text-sm text-slate-700 break-words">
                              {msg.body}
                            </div>
                            {msg.error && (
                              <div className="mt-2 text-xs text-rose-600 bg-rose-50 p-2 rounded border border-rose-100">
                                <strong>Error:</strong> {msg.error}
                              </div>
                            )}
                            {msg.status === 'failed' && (
                              <button 
                                onClick={() => forwardMessage(msg)}
                                className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                              >
                                Retry Forwarding
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </main>
        </>
      )}
    </div>
  );
}
