import fetch from 'node-fetch';

async function test() {
  const gatewayUrl = "https://ais-dev-4uooszonx4462aqp3nygxs-655324132189.asia-southeast1.run.app/api/webhook/sms";
  const payload = {
    sender: "+919443659308",
    message: "PAY 9443659308 100 6383454249 1212"
  };
  
  console.log("Sending to Gateway:", gatewayUrl);
  console.log("Payload:", JSON.stringify(payload, null, 2));
  
  try {
    const res = await fetch(gatewayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response:", text);
  } catch (e) {
    console.error("Error:", e);
  }
}

test();
