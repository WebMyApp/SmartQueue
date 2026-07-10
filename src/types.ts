export interface Branch {
  id: string;
  name: string;
  address: string;
  currentNumber: number;
  activeCounters: number;
  createdAt: string;
}

export interface QueueTicket {
  id: string;
  branchId: string;
  queueNumber: string; // e.g. A-001, B-012
  customerName: string;
  serviceType: string; // e.g. Teller, Customer Service, Tech Support
  status: "waiting" | "serving" | "completed" | "skipped";
  counterNumber?: number;
  phoneNumber?: string;
  createdAt: string;
  calledAt?: string;
  completedAt?: string;
}

export interface Counter {
  id: string;
  branchId: string;
  counterNumber: number;
  status: "active" | "inactive";
  currentTicketId?: string;
  operatorName?: string;
}

export interface UserSession {
  uid: string;
  email: string;
  role: "admin" | "super_admin";
  branchId?: string; // If role is admin
  name: string;
}
