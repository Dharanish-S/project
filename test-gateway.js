import fetch from 'node-fetch';

async function test() {
  console.log("Sending payload from SMS Gateway to Main Server...");
  const payload = {
    query: "PAY 9443659308 100 6383454249 1212"
  };
  
  console.log("Payload:", JSON.stringify(payload, null, 2));
  
  const res = await fetch('http://localhost:3000/receive-query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  console.log("Response Status:", res.status);
  const text = await res.text();
  console.log("Response Body:", text);
}

test();
