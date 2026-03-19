import fetch from "node-fetch";

async function testWebhook() {
  const url = "https://ais-pre-4uooszonx4462aqp3nygxs-655324132189.asia-southeast1.run.app/api/webhook/sms";
  console.log(`Sending test payload to SMS Gateway Webhook: ${url}`);
  
  const payload = { 
    sender: "9443659308", 
    message: "PAY 9443659308 50 9943534859 1212", 
    text: "PAY 9443659308 50 9943534859 1212", 
    query: "PAY 9443659308 50 9943534859 1212",
    timestamp: new Date().toISOString() 
  };

  try {
    const response = await fetch(url, {
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
      console.log("Gateway Response Text:", text.substring(0, 200) + "...");
    }
  } catch (error) {
    console.error("Failed to reach external gateway:", error);
  }
}

testWebhook();
