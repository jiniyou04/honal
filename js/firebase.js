// Firebase 연결 설정
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, deleteDoc, updateDoc, query, orderBy, writeBatch, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { getAI, GoogleAIBackend, getGenerativeModel } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-ai.js";

const firebaseConfig = {
    apiKey: "AIzaSyBJPt9wTTb-pkxI0_9xv6eFAHoE2imyTIQ",
    authDomain: "honal-a0a82.firebaseapp.com",
    projectId: "honal-a0a82",
    storageBucket: "honal-a0a82.firebasestorage.app",
    messagingSenderId: "563434632790",
    appId: "1:563434632790:web:5f281c1e19145170a92df7",
    measurementId: "G-NQGFBB8E3K"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const ai = getAI(app, { backend: new GoogleAIBackend() });
const model = getGenerativeModel(ai, { model: "gemini-3-flash-preview" });

// Gemini 키는 Firebase AI Logic에서 관리하며 클라이언트에 넣지 않습니다.
export async function generateAIContent(payload) {
    const result = await model.generateContent(payload);
    return result.response;
}

export { app, db };
export { getFirestore, collection, addDoc, getDocs, doc, deleteDoc, updateDoc, query, orderBy, writeBatch, getDoc, setDoc };
