import express from "express";
console.log("🏁 SERVER SCRIPT STARTING...");
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { Server } from "socket.io";
import cors from "cors";

// --- SMS GATEWAY HELPERS ---
function getGatewayConfig(key: string, defaultValue: string): string {
  const row = db.prepare("SELECT value FROM gateway_config WHERE key = ?").get(key);
  return row ? row.value : defaultValue;
}

function setGatewayConfig(key: string, value: string) {
  db.prepare("INSERT OR REPLACE INTO gateway_config (key, value) VALUES (?, ?)").run(key, value);
}

const GATEWAY_PIN = "123456";
let pendingQueries: any[] = [];

let io: Server;
let db: any;
const usersSockets = new Map<string, string>(); // phone -> socketId

async function startServer() {
  db = new Database("zpay.db");
  
  // Initialize Database
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE,
      name TEXT,
      balance INTEGER,
      pin TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      sender_phone TEXT,
      receiver_phone TEXT,
      amount INTEGER
    );

    CREATE TABLE IF NOT EXISTS gateway_messages (
      id TEXT PRIMARY KEY,
      sender TEXT,
      body TEXT,
      status TEXT,
      timestamp TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS gateway_config (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Seed Gateway Config if empty
  const configCount = db.prepare("SELECT COUNT(*) as count FROM gateway_config").get().count;
  if (configCount === 0) {
    db.prepare("INSERT INTO gateway_config (key, value) VALUES (?, ?)").run("mainServerUrl", "/receive-query");
    db.prepare("INSERT INTO gateway_config (key, value) VALUES (?, ?)").run("mainServerMethod", "POST");
    db.prepare("INSERT INTO gateway_config (key, value) VALUES (?, ?)").run("isGatewayActive", "1");
  }

  // Seed Database
  const stmt = db.prepare("SELECT COUNT(*) as count FROM users");
  const { count } = stmt.get() as { count: number };
  if (count === 0) {
    const insertUser = db.prepare(
      "INSERT INTO users (phone, name, balance, pin) VALUES (?, ?, ?, ?)"
    );
    insertUser.run("9443659308", "Selvi", 500, "1212");
    insertUser.run("6383454249", "Dharanish", 1000, "1212");
    insertUser.run("9943534859", "Siva", 750, "1212");
    insertUser.run("9791611283", "New User", 1000, "1212");
    insertUser.run("7373330608", "kavin", 300, "1212");
  }

  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cors());

  // Add this to the Main Server (ZPay) server.ts to allow cross-origin requests from the SMS Gateway
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // Health check for the platform
  app.get("/health", (req, res) => {
    res.status(200).send("OK");
  });

  // --- SMS GATEWAY API ROUTES ---

  app.get("/api/config", (req, res) => {
    res.json({ 
      mainServerUrl: getGatewayConfig("mainServerUrl", "/receive-query"), 
      mainServerMethod: getGatewayConfig("mainServerMethod", "POST") 
    });
  });

  app.post("/api/config", (req, res) => {
    const { mainServerUrl, mainServerMethod } = req.body;
    if (mainServerUrl) setGatewayConfig("mainServerUrl", mainServerUrl);
    if (mainServerMethod) setGatewayConfig("mainServerMethod", mainServerMethod);
    res.json({ success: true, mainServerUrl, mainServerMethod });
  });

  app.get("/api/gateway/status", (req, res) => {
    res.json({ isActive: getGatewayConfig("isGatewayActive", "1") === "1" });
  });

  app.post("/api/gateway/status", (req, res) => {
    const { isActive, pin } = req.body;
    if (pin !== GATEWAY_PIN) {
      return res.status(401).json({ success: false, message: "Invalid PIN" });
    }
    
    const currentStatus = getGatewayConfig("isGatewayActive", "1") === "1";
    const newStatus = !!isActive;
    setGatewayConfig("isGatewayActive", newStatus ? "1" : "0");
    
    console.log(`Gateway status changed to: ${newStatus ? 'ACTIVE' : 'INACTIVE'}`);
    
    // If we just activated the gateway, process all pending queries
    if (newStatus && !currentStatus && pendingQueries.length > 0) {
      console.log(`Processing ${pendingQueries.length} pending queries...`);
      const queriesToProcess = [...pendingQueries];
      pendingQueries = [];
      
      queriesToProcess.forEach(q => {
        if (q.timeout) clearTimeout(q.timeout);
        processQueryThroughGateway(q.req, q.res, q.body, q.newMessage);
      });
    }
    
    res.json({ success: true, isActive: newStatus });
  });

  app.post("/api/gateway/login", (req, res) => {
    const { pin } = req.body;
    if (pin === GATEWAY_PIN) {
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false, message: "Invalid PIN" });
    }
  });

  function emitTransactionUpdate(sender: string, receiver: string) {
    console.log(`📡 Emitting transaction_updated for Sender=${sender}, Receiver=${receiver}`);
    const senderSocket = usersSockets.get(sender);
    const receiverSocket = usersSockets.get(receiver);
    
    if (senderSocket) {
      io.to(senderSocket).emit("transaction_updated", { sender_phone: sender, receiver_phone: receiver });
    }
    if (receiverSocket) {
      io.to(receiverSocket).emit("transaction_updated", { sender_phone: sender, receiver_phone: receiver });
    }
    io.emit("transaction_updated");
  }

  function processQueryThroughGateway(req: any, res: any, body: string, newMessage: any) {
    console.log(`[Gateway] Processing message ${newMessage.id} through gateway...`);
    
    const mockReq = {
      method: 'POST',
      query: {},
      body: { query: body },
      headers: {}
    };
    
    const mockRes = {
      statusCode: 200,
      status: function(code: number) {
        this.statusCode = code;
        return this;
      },
      json: function(data: any) {
        console.log(`[Gateway] Main server responded with ${this.statusCode}:`, data);
        
        const status = this.statusCode === 200 ? 'forwarded' : 'failed';
        const error = this.statusCode !== 200 ? data.message : null;
        
        db.prepare("UPDATE gateway_messages SET status = ?, error = ? WHERE id = ?")
          .run(status, error, newMessage.id);
        
        // Notify dashboard of status update
        io.emit("gateway_message_updated");
        
        // Respond to the original sender AFTER updating the gateway dashboard
        res.status(this.statusCode).json(data);

        // Emit socket AFTER updating the gateway dashboard
        if (this.statusCode === 200 && data.sender && data.receiver) {
          emitTransactionUpdate(data.sender, data.receiver);
        } else if (this.statusCode !== 200) {
           const parts = String(body).split(/\s+/);
           if (parts.length >= 2) {
             const sender = parts[1].replace(/^\+91|^0/, '');
             const senderSocket = usersSockets.get(sender);
             if (senderSocket) {
               io.to(senderSocket).emit("transaction_failed", { reason: data.message });
             }
           }
        }
      },
      send: function(data: any) {
        this.json(data);
      }
    };
    
    handleReceiveQuery(mockReq, mockRes);
  }

  const handleIncomingQuery = async (req: express.Request, res: express.Response) => {
    console.log("--- INCOMING QUERY RECEIVED (GATEWAY) ---");
    const from = req.body?.From || req.body?.from || req.body?.sender || req.body?.phone || req.body?.number || req.body?.source ||
                 req.query?.from || req.query?.sender || req.query?.phone || req.query?.number || req.query?.source || 'Website';
    
    let body = req.body?.Body || req.body?.body || req.body?.message || req.body?.text || req.body?.msg || req.body?.content || req.body?.query ||
               req.query?.body || req.query?.message || req.query?.text || req.query?.msg || req.query?.content || req.query?.query;

    if (!body) {
      if (typeof req.body === 'string' && req.body.trim().length > 0) {
        body = req.body;
      } else if (req.body && Object.keys(req.body).length > 0) {
        body = "[Raw JSON] " + JSON.stringify(req.body);
      } else if (req.query && Object.keys(req.query).length > 0) {
        body = "[Raw Query] " + JSON.stringify(req.query);
      } else {
        body = "[Empty Payload Received]";
      }
    }

    const newMessage = {
      id: Math.random().toString(36).substring(2, 9),
      sender: String(from),
      body: String(body),
      status: 'received',
      timestamp: new Date().toISOString(),
      error: null
    };

    db.prepare("INSERT INTO gateway_messages (id, sender, body, status, timestamp, error) VALUES (?, ?, ?, ?, ?, ?)")
      .run(newMessage.id, newMessage.sender, newMessage.body, newMessage.status, newMessage.timestamp, newMessage.error);
    
    // Notify dashboard of new message
    io.emit("gateway_message_updated");
    
    const isGatewayActive = getGatewayConfig("isGatewayActive", "1") === "1";
    
    // If gateway is inactive, queue the message and DO NOT respond yet.
    // The client will wait for the socket or timeout.
    if (!isGatewayActive) {
      console.log(`[Gateway] Gateway is INACTIVE. Queuing message ${newMessage.id}`);
      const timeout = setTimeout(() => {
        const index = pendingQueries.findIndex(q => q.newMessage.id === newMessage.id);
        if (index !== -1) {
          console.log(`[Gateway] Pending query ${newMessage.id} timed out after 60s`);
          pendingQueries.splice(index, 1);
          res.status(504).json({ success: false, message: "Gateway timeout" });
        }
      }, 60000);
      
      pendingQueries.push({ req, res, body, newMessage, timeout });
      return;
    }
    
    processQueryThroughGateway(req, res, body, newMessage);
  };

  app.all("/api/webhook/sms", handleIncomingQuery);
  app.all("/api/query", handleIncomingQuery);
  app.all("/sms", handleIncomingQuery);
  app.all("/webhook", handleIncomingQuery);
  app.all("/api/sms", handleIncomingQuery);

  app.get("/api/messages", (req, res) => {
    const messages = db.prepare("SELECT * FROM gateway_messages ORDER BY timestamp DESC").all();
    // Map 'sender' to 'from' for frontend compatibility
    const formattedMessages = messages.map((m: any) => ({
      ...m,
      from: m.sender
    }));
    res.json(formattedMessages);
  });

  app.post("/api/messages/:id/status", (req, res) => {
    const { id } = req.params;
    const { status, error } = req.body;
    
    const result = db.prepare("UPDATE gateway_messages SET status = ?, error = ? WHERE id = ?")
      .run(status, error || null, id);
    
    if (result.changes > 0) {
      io.emit("gateway_message_updated");
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, error: "Message not found" });
    }
  });

  app.get("/api/stats", (req, res) => {
    const totalReceived = db.prepare("SELECT COUNT(*) as count FROM gateway_messages").get().count;
    const totalForwarded = db.prepare("SELECT COUNT(*) as count FROM gateway_messages WHERE status = 'forwarded'").get().count;
    const totalFailed = db.prepare("SELECT COUNT(*) as count FROM gateway_messages WHERE status = 'failed'").get().count;
    
    res.json({ totalReceived, totalForwarded, totalFailed });
  });

  app.post("/api/clear", (req, res) => {
    db.prepare("DELETE FROM gateway_messages").run();
    io.emit("gateway_message_updated");
    res.json({ success: true });
  });

  // --- SMS GATEWAY PROXY ---
  // This endpoint is called by the frontend. 
  // It forwards the payment request to the internal SMS Gateway.
  app.post("/api/send-to-gateway", handleIncomingQuery);

  app.all("/api/query", (req, res) => {
    console.log("--- INCOMING REQUEST AT /api/query ---");
    return handleIncomingQuery(req, res);
  });

  app.all("/receive-query", (req, res) => {
    console.log("--- INCOMING REQUEST AT /receive-query ---");
    return handleIncomingQuery(req, res);
  });

  function handleReceiveQuery(req: any, res: any) {
    console.log("--- INCOMING REQUEST AT /receive-query ---");
    console.log("Method:", req.method);
    console.log("Query Params:", req.query);
    console.log("Body:", req.body);
    console.log("Headers:", req.headers);

    let smsQuery = "";
    
    // Try to find the query in various places
    if (req.query.query) {
      smsQuery = req.query.query.toString();
    } else if (req.body.query) {
      smsQuery = req.body.query.toString();
    } else if (req.query.body) {
      smsQuery = req.query.body.toString();
    } else if (req.body.body) {
      smsQuery = req.body.body.toString();
    } else if (req.body.message) {
      smsQuery = req.body.message.toString();
    } else if (typeof req.body === 'string') {
      smsQuery = req.body;
    } else if (req.body && Object.keys(req.body).length > 0 && !req.body.query && !req.body.body) {
      // If the body is an object but doesn't have 'query', maybe the whole body is the query?
      const firstKey = Object.keys(req.body)[0];
      if (firstKey.toUpperCase().startsWith("PAY")) {
        smsQuery = firstKey;
      }
    }

    smsQuery = smsQuery.trim();

    if (smsQuery) {
      console.log("Extracted SMS Query:", smsQuery);
      
      const parts = smsQuery.split(/\s+/);
      console.log("Parsed Parts:", parts);
      
      if (parts[0].toUpperCase() === "PAY" && parts.length >= 4) {
        const sender = parts[1].replace(/^\+91|^0/, '');
        const amount = parseInt(parts[2], 10);
        const receiver = parts[3].replace(/^\+91|^0/, ''); // Normalize receiver too
        // PIN is no longer required for customer transactions

        console.log(`Processing: Sender=${sender}, Amount=${amount}, Receiver=${receiver}`);

        if (!isNaN(amount) && amount > 0) {
          const senderRecord = db.prepare("SELECT * FROM users WHERE phone = ?").get(sender) as any;
          const receiverRecord = db.prepare("SELECT * FROM users WHERE phone = ?").get(receiver) as any;

          console.log("Sender Record:", senderRecord ? "Found" : "NOT Found");
          console.log("Receiver Record:", receiverRecord ? "Found" : "NOT Found");

          if (senderRecord && receiverRecord) {
            console.log(`Validation: Sufficient Balance=${senderRecord.balance >= amount} (Has: ${senderRecord.balance}, Needs: ${amount})`);
            
            if (senderRecord.balance >= amount) {
              const updateSender = db.prepare("UPDATE users SET balance = balance - ? WHERE phone = ?");
              const updateReceiver = db.prepare("UPDATE users SET balance = balance + ? WHERE phone = ?");
              const insertTx = db.prepare(
                "INSERT INTO transactions (sender_phone, receiver_phone, amount) VALUES (?, ?, ?)"
              );

              const transaction = db.transaction(() => {
                updateSender.run(amount, sender);
                updateReceiver.run(amount, receiver);
                insertTx.run(sender, receiver, amount);
              });

              try {
                transaction();
                console.log("✅ Database transaction SUCCESSFUL");
                
                const senderAfter = db.prepare("SELECT balance FROM users WHERE phone = ?").get(sender) as any;
                const receiverAfter = db.prepare("SELECT balance FROM users WHERE phone = ?").get(receiver) as any;
                console.log(`New Balances: Sender=${senderAfter.balance}, Receiver=${receiverAfter.balance}`);
                
                // Return success to the caller (Gateway)
                // The Gateway will handle socket emission after updating its dashboard
                return res.status(200).json({ 
                  success: true, 
                  message: "Transaction successful",
                  sender,
                  receiver,
                  amount
                });
              } catch (err) {
                console.error("❌ Database transaction failed:", err);
                return res.status(500).json({ success: false, message: "Internal server error during transaction" });
              }
            } else {
              const reason = "Insufficient balance";
              console.log(`❌ Transaction failed: ${reason}`);
              return res.status(400).json({ success: false, message: reason });
            }
          } else {
            const reason = !senderRecord ? "Sender not found" : "Receiver not found";
            console.log(`❌ Transaction failed: ${reason}`);
            return res.status(400).json({ success: false, message: reason });
          }
        } else {
          console.log("❌ Transaction failed: Invalid amount");
          return res.status(400).json({ success: false, message: "Invalid amount" });
        }
      } else {
        console.log("❌ Invalid SMS format received:", smsQuery);
        return res.status(400).json({ success: false, message: "Invalid format. Use: PAY <SENDER> <AMOUNT> <RECEIVER>" });
      }
    } else {
      console.log("⚠️ Received request at /receive-query but no query could be extracted.");
      return res.status(400).json({ success: false, message: "Missing query. Please send 'query' parameter or raw body." });
    }
  }

  // API Routes
  app.post("/api/login", (req, res) => {
    const { phone } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE phone = ?").get(phone);
    if (user) {
      res.json({ success: true, user });
    } else {
      res.status(404).json({ success: false, message: "This number is not registered" });
    }
  });

  // --- INTERNAL TEST GATEWAY ---
  // This is kept for local testing. 
  // To use it, set SMS_GATEWAY_URL to http://localhost:3000/api/mock-gateway/incoming
  app.post("/api/mock-gateway/incoming", async (req, res) => {
    const { message } = req.body;

    try {
      console.log(`Internal Mock Gateway forwarding query: ${message}`);
      
      // Forward to Main Server (127.0.0.1 bypasses the AI Studio proxy)
      const response = await fetch("http://127.0.0.1:3000/receive-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: message })
      });

      const data = await response.json();
      res.json({ success: true, message: "Forwarded to Main Server", data });
    } catch (err) {
      console.error("Internal Mock Gateway failed to forward:", err);
      res.status(500).json({ success: false, message: "Failed to forward" });
    }
  });

  app.get("/api/debug/db", (req, res) => {
    const users = db.prepare("SELECT * FROM users").all();
    const transactions = db.prepare("SELECT * FROM transactions ORDER BY timestamp DESC").all();
    res.json({ users, transactions });
  });

  app.get("/api/user/:phone", (req, res) => {
    const user = db.prepare("SELECT * FROM users WHERE phone = ?").get(req.params.phone);
    if (user) {
      res.json({ success: true, user });
    } else {
      res.status(404).json({ success: false, message: "User not found" });
    }
  });

  app.get("/api/transactions/:phone", (req, res) => {
    try {
      const phone = req.params.phone;
      const transactions = db
        .prepare(
          "SELECT id, datetime(timestamp, 'utc') as timestamp, sender_phone, receiver_phone, amount FROM transactions WHERE sender_phone = ? OR receiver_phone = ? ORDER BY timestamp DESC"
        )
        .all(phone, phone);
      
      const formattedTransactions = transactions.map((tx: any) => ({
        ...tx,
        timestamp: tx.timestamp.replace(' ', 'T') + 'Z'
      }));

      res.json({ success: true, transactions: formattedTransactions });
    } catch (err: any) {
      res.status(500).json({ success: false, message: "Failed to fetch transactions", error: err.message });
    }
  });

  app.post("/api/pay", (req, res) => {
    const { sender_phone, receiver_phone, amount } = req.body;

    if (amount > 200) {
      return res.status(400).json({ success: false, message: "Per transaction limit is 200" });
    }

    const sender = db.prepare("SELECT * FROM users WHERE phone = ?").get(sender_phone) as any;
    if (!sender) {
      return res.status(400).json({ success: false, message: "Sender not found" });
    }

    if (sender.balance < amount) {
      return res.status(400).json({ success: false, message: "Insufficient balance" });
    }

    const receiver = db.prepare("SELECT * FROM users WHERE phone = ?").get(receiver_phone) as any;
    if (!receiver) {
      return res.status(400).json({ success: false, message: "Receiver not found" });
    }

    const updateSender = db.prepare("UPDATE users SET balance = balance - ? WHERE phone = ?");
    const updateReceiver = db.prepare("UPDATE users SET balance = balance + ? WHERE phone = ?");
    const insertTx = db.prepare(
      "INSERT INTO transactions (sender_phone, receiver_phone, amount, timestamp) VALUES (?, ?, ?, ?)"
    );

    let txId: number | bigint;
    const transaction = db.transaction((ts: string) => {
      updateSender.run(amount, sender_phone);
      updateReceiver.run(amount, receiver_phone);
      const result = insertTx.run(sender_phone, receiver_phone, amount, ts || new Date().toISOString());
      txId = result.lastInsertRowid;
    });

    try {
      transaction(req.body.timestamp);
      const newTx = db.prepare("SELECT id, datetime(timestamp, 'utc') as timestamp, sender_phone, receiver_phone, amount FROM transactions WHERE id = ?").get(txId) as any;
      
      io.to(usersSockets.get(sender_phone) || "").emit("transaction_updated");
      io.to(usersSockets.get(receiver_phone) || "").emit("transaction_updated");

      res.json({ 
        success: true, 
        message: "Payment successful",
        transaction: {
          ...newTx,
          timestamp: newTx.timestamp.replace(' ', 'T') + 'Z'
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, message: "Transaction failed" });
    }
  });

  app.post("/api/simulate-sms", (req, res) => {
    const { sender_phone, sms_body, timestamp } = req.body;
    
    const queryRegex = /ZPAY_QUERY:\s+RECEIVER='(\d+)'\s+AMOUNT=(\d+)/;
    const match = sms_body.match(queryRegex);
    
    if (!match) {
      return res.status(400).json({ success: false, message: "Invalid Query format. Use: ZPAY_QUERY: RECEIVER='<phone>' AMOUNT=<amount>" });
    }

    const receiver_phone = match[1];
    const amount = parseInt(match[2], 10);

    const sender = db.prepare("SELECT * FROM users WHERE phone = ?").get(sender_phone) as any;
    const receiver = db.prepare("SELECT * FROM users WHERE phone = ?").get(receiver_phone) as any;

    if (!sender || sender.balance < amount || !receiver) {
      return res.status(400).json({ success: false, message: "Invalid transaction details" });
    }

    const updateSender = db.prepare("UPDATE users SET balance = balance - ? WHERE phone = ?");
    const updateReceiver = db.prepare("UPDATE users SET balance = balance + ? WHERE phone = ?");
    const insertTx = db.prepare(
      "INSERT INTO transactions (sender_phone, receiver_phone, amount, timestamp) VALUES (?, ?, ?, ?)"
    );

    let txId: number | bigint;
    const transaction = db.transaction((ts: string) => {
      updateSender.run(amount, sender_phone);
      updateReceiver.run(amount, receiver_phone);
      const result = insertTx.run(sender_phone, receiver_phone, amount, ts || new Date().toISOString());
      txId = result.lastInsertRowid;
    });

    try {
      transaction(timestamp);
      const newTx = db.prepare("SELECT id, datetime(timestamp, 'utc') as timestamp, sender_phone, receiver_phone, amount FROM transactions WHERE id = ?").get(txId) as any;
      
      io.to(usersSockets.get(sender_phone) || "").emit("transaction_updated");
      io.to(usersSockets.get(receiver_phone) || "").emit("transaction_updated");

      res.json({ 
        success: true, 
        message: `ZPay Success: Rs.${amount} sent to ${receiver_phone}.`,
        transaction: {
          ...newTx,
          timestamp: newTx.timestamp.replace(' ', 'T') + 'Z'
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, message: "Database update failed" });
    }
  });

  app.post("/api/simulate-webhook", async (req, res) => {
    try {
      // Forward the request server-to-server to avoid browser CORS issues
      // The frontend sends { sender, message, timestamp }
      // We send this to the Gateway's INCOMING webhook, which expects { sender, message }
      // The Gateway will then strip the sender and forward {"query": "message"} to our /receive-query endpoint
      const gatewayPayload = {
        sender: req.body.sender,
        message: req.body.message
      };
      
      const response = await fetch("http://127.0.0.1:3000/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gatewayPayload)
      });
      
      const text = await response.text();
      res.json({ success: response.ok, responseText: text });
    } catch (err: any) {
      console.error("Webhook forwarding failed:", err);
      res.status(500).json({ success: false, message: "Failed to forward to webhook", error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("🚀 Initializing Vite server...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("✅ Vite middleware attached.");
  } else {
    console.log("📦 Serving production build...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const httpServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server listening on http://0.0.0.0:${PORT}`);
  });

  console.log("🔌 Initializing Socket.io...");
  io = new Server(httpServer);
  console.log("✅ Socket.io initialized.");

  io.on("connection", (socket) => {
    socket.on("register", (phone, callback) => {
      usersSockets.set(phone, socket.id);
      console.log(`📱 User ${phone} registered socket: ${socket.id}`);
      if (typeof callback === 'function') {
        callback({ success: true });
      }
    });

    socket.on("disconnect", () => {
      for (const [phone, id] of usersSockets.entries()) {
        if (id === socket.id) {
          usersSockets.delete(phone);
          console.log(`🔌 User ${phone} disconnected`);
          break;
        }
      }
    });
  });
}

startServer().catch(err => {
  console.error("❌ FAILED TO START SERVER:", err);
  process.exit(1);
});
