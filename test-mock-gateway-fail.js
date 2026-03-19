import fetch from 'node-fetch';

async function testGateway() {
  const payload = {
    sender: "9443659308",
    message: "PAY 9443659308 100 6383454249 9999" // Wrong PIN
  };

  try {
    const res = await fetch('http://127.0.0.1:3000/api/mock-gateway/incoming', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    console.log("Response:", data);
  } catch (err) {
    console.error("Error:", err);
  }
}

testGateway();
