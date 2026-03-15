import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { Server } from "socket.io";

const db = new Database("zpay.db");
const usersSockets = new Map<string, string>(); // phone -> socketId

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
`);

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
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const httpServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  const io = new Server(httpServer);

  io.on("connection", (socket) => {
    socket.on("register", (phone) => {
      usersSockets.set(phone, socket.id);
      console.log(`User ${phone} connected with socket ${socket.id}`);
    });

    socket.on("disconnect", () => {
      for (const [phone, id] of usersSockets.entries()) {
        if (id === socket.id) {
          usersSockets.delete(phone);
          break;
        }
      }
    });
  });

  // Twilio Incoming SMS Webhook
  app.post("/incoming-sms", (req, res) => {
    const sender = req.body.From || "";
    const text = req.body.Body || "";

    const parts = text.trim().split(/\s+/);
    
    if (parts.length >= 4 && parts[0].toUpperCase() === "PAY") {
      const amount = parseInt(parts[1], 10);
      const receiver = parts[2];
      const pin = parts[3];
      
      const normalizedSender = sender.replace(/^\+91|^0/, '');
      
      if (!isNaN(amount) && amount > 0) {
        const senderRecord = db.prepare("SELECT * FROM users WHERE phone = ?").get(normalizedSender) as any;
        const receiverRecord = db.prepare("SELECT * FROM users WHERE phone = ?").get(receiver) as any;

        if (senderRecord && senderRecord.pin === pin && senderRecord.balance >= amount && receiverRecord) {
          const updateSender = db.prepare("UPDATE users SET balance = balance - ? WHERE phone = ?");
          const updateReceiver = db.prepare("UPDATE users SET balance = balance + ? WHERE phone = ?");
          const insertTx = db.prepare(
            "INSERT INTO transactions (sender_phone, receiver_phone, amount) VALUES (?, ?, ?)"
          );

          const transaction = db.transaction(() => {
            updateSender.run(amount, normalizedSender);
            updateReceiver.run(amount, receiver);
            insertTx.run(normalizedSender, receiver, amount);
          });

          try {
            transaction();
            io.to(usersSockets.get(normalizedSender) || "").emit("transaction_updated");
            io.to(usersSockets.get(receiver) || "").emit("transaction_updated");
          } catch (err) {
            console.log("❌ Database transaction failed", err);
          }
        } else {
          console.log("❌ Transaction condition failed:", {
            senderFound: !!senderRecord,
            pinCorrect: senderRecord?.pin === pin,
            balanceSufficient: senderRecord?.balance >= amount,
            receiverFound: !!receiverRecord
          });
        }
      }
    }
    res.status(200).send("SMS received");
  });

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
    const { sender_phone, receiver_phone, amount, pin } = req.body;

    if (amount > 200) {
      return res.status(400).json({ success: false, message: "Per transaction limit is 200" });
    }

    const sender = db.prepare("SELECT * FROM users WHERE phone = ?").get(sender_phone) as any;
    if (!sender || sender.pin !== pin) {
      return res.status(400).json({ success: false, message: "Invalid PIN or sender not found" });
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
    
    const parts = sms_body.trim().split(/\s+/);
    
    if (parts[0].toUpperCase() !== "ZPAY" || parts.length !== 4) {
      return res.status(400).json({ success: false, message: "Invalid SMS format. Use: ZPAY <phone> <amount> <pin>" });
    }

    const receiver_phone = parts[1];
    const amount = parseInt(parts[2], 10);
    const pin = parts[3];

    const sender = db.prepare("SELECT * FROM users WHERE phone = ?").get(sender_phone) as any;
    const receiver = db.prepare("SELECT * FROM users WHERE phone = ?").get(receiver_phone) as any;

    if (!sender || sender.pin !== pin || sender.balance < amount || !receiver) {
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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
}

startServer();
