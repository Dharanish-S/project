import fetch from 'node-fetch';

async function test() {
  const payload = {
    sender: "9443659308",
    message: "PAY 9443659308 100 6383454249 1212",
    timestamp: new Date().toISOString()
  };
  
  console.log("Sending to Mock Gateway:", payload);
  
  try {
    const res = await fetch('http://127.0.0.1:3000/api/mock-gateway/incoming', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Response:", data);
  } catch (e) {
    console.error("Error:", e);
  }
}

test();
