import { useState } from 'react';
import { ArrowLeft, Send, CheckCircle, XCircle, Terminal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function GatewayTest() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('PAY 9443659308 50 6383454249 1212');
  const [method, setMethod] = useState<'GET' | 'POST'>('POST');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  const handleTest = async () => {
    setLoading(true);
    setResult(null);
    setLogs([]);
    addLog(`Starting test with method ${method}...`);

    try {
      let url = '/receive-query';
      let options: RequestInit = { method };

      if (method === 'GET') {
        url += `?query=${encodeURIComponent(query)}`;
        addLog(`Request URL: ${url}`);
      } else {
        options.headers = { 'Content-Type': 'application/json' };
        options.body = JSON.stringify({ query });
        addLog(`Request Body: ${options.body}`);
      }

      const response = await fetch(url, options);
      const data = await response.json();
      
      setResult({
        status: response.status,
        ok: response.ok,
        data
      });

      addLog(`Response Status: ${response.status}`);
      addLog(`Response Data: ${JSON.stringify(data)}`);

      if (response.ok) {
        addLog('✅ Transaction processed successfully!');
      } else {
        addLog(`❌ Transaction failed: ${data.message || 'Unknown error'}`);
      }
    } catch (err: any) {
      addLog(`❌ Network Error: ${err.message}`);
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-2xl mx-auto">
        <button 
          onClick={() => navigate('/')}
          className="flex items-center text-indigo-400 mb-8 hover:text-indigo-300 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to App
        </button>

        <div className="bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-700 mb-6">
          <h2 className="text-xl font-bold mb-4 text-indigo-400">Gateway Configuration</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-400 mb-1">Your Main Server URL (for Gateway Forwarding):</p>
              <div className="bg-black p-3 rounded-lg font-mono text-xs break-all border border-gray-700 select-all">
                {window.location.origin}/receive-query
              </div>
            </div>
            <div className="p-4 bg-indigo-900/20 border border-indigo-800 rounded-xl">
              <p className="text-xs text-indigo-300">
                <strong>Setup Instructions:</strong> Configure your SMS Gateway website to forward incoming SMS queries to the URL above using a <strong>POST</strong> or <strong>GET</strong> request with a <code>query</code> parameter.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-700">
          <h1 className="text-2xl font-bold mb-6 flex items-center">
            <Terminal className="w-6 h-6 mr-3 text-indigo-500" />
            SMS Gateway Simulator
          </h1>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                SMS Query String
              </label>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="PAY SENDER AMOUNT RECEIVER PIN"
              />
              <p className="mt-2 text-xs text-gray-500">
                Format: PAY [SenderPhone] [Amount] [ReceiverPhone] [PIN]
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                HTTP Method
              </label>
              <div className="flex space-x-4">
                {(['POST', 'GET'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={`flex-1 py-2 rounded-lg border transition-all ${
                      method === m 
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20' 
                        : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleTest}
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center shadow-lg shadow-indigo-600/20"
            >
              {loading ? (
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <Send className="w-5 h-5 mr-2" />
                  Simulate Gateway Forward
                </>
              )}
            </button>
          </div>

          {result && (
            <div className={`mt-8 p-6 rounded-xl border ${result.ok ? 'bg-green-900/20 border-green-800' : 'bg-red-900/20 border-red-800'}`}>
              <div className="flex items-center mb-4">
                {result.ok ? (
                  <CheckCircle className="w-6 h-6 text-green-500 mr-2" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-500 mr-2" />
                )}
                <span className="font-bold text-lg">
                  {result.ok ? 'Success' : 'Failed'} (Status: {result.status})
                </span>
              </div>
              <pre className="bg-black/40 p-4 rounded-lg text-sm font-mono overflow-x-auto">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            </div>
          )}

          <div className="mt-8">
            <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center">
              <Terminal className="w-4 h-4 mr-2" />
              Execution Logs
            </h3>
            <div className="bg-black rounded-xl p-4 font-mono text-xs h-48 overflow-y-auto space-y-1 border border-gray-800">
              {logs.length === 0 && <p className="text-gray-700 italic">No logs yet...</p>}
              {logs.map((log, i) => (
                <p key={i} className={log.includes('❌') ? 'text-red-400' : log.includes('✅') ? 'text-green-400' : 'text-gray-400'}>
                  {log}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
