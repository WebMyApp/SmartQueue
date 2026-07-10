import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAzdcIv7NdAGgW-9lylcvgL1fTX8iJSR9c",
  authDomain: "sacred-biplane-w6rpq.firebaseapp.com",
  projectId: "sacred-biplane-w6rpq",
  storageBucket: "sacred-biplane-w6rpq.firebasestorage.app",
  messagingSenderId: "454718741020",
  appId: "1:454718741020:web:abd01577fb96f5bce81dd9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with the custom database ID
export const db = getFirestore(app, "ai-studio-smartqueuemanage-48b45077-c81c-4f30-afbd-02d9622aaa8f");

// Test Connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    console.log("Firebase Firestore connected successfully!");
  } catch (error) {
    console.error("Firebase connection test error:", error);
  }
}
testConnection();
