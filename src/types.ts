export interface User {
  id: number;
  phone: string;
  name: string;
  balance: number;
  pin: string;
}

export interface Transaction {
  id: number;
  timestamp: string;
  sender_phone: string;
  receiver_phone: string;
  amount: number;
}
