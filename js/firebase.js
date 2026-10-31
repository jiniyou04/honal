// Firebase 연결 설정
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, deleteDoc, updateDoc, query, orderBy, writeBatch, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

export { app, db };
export { getFirestore, collection, addDoc, getDocs, doc, deleteDoc, updateDoc, query, orderBy, writeBatch, getDoc, setDoc };
