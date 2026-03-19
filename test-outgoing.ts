import fetch from "node-fetch";

async function testOutgoing() {
  const gatewayUrl = "https://ais-pre-4uooszonx4462aqp3nygxs-655324132189.asia-southeast1.run.app/api/query";
  console.log(`Sending test payload to SMS Gateway: ${gatewayUrl}`);
  
  const payload = { 
    sender: "9443659308", 
    query: "PAY 9443659308 50 9943534859 1212", 
    message: "PAY 9443659308 50 9943534859 1212", 
    timestamp: new Date().toISOString() 
  };

  console.log("Payload:", JSON.stringify(payload, null, 2));

  try {
    const response = await fetch(gatewayUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    console.log(`Gateway Response Status: ${response.status} ${response.statusText}`);
    
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const data = await response.json();
      console.log("Gateway Response JSON:", data);
    } else {
      const text = await response.text();
      console.log("Gateway Response Text:", text);
    }
  } catch (error) {
    console.error("Failed to reach external gateway:", error);
  }
}

testOutgoing();
