import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-app-check.js';
import { getAI, GoogleAIBackend, getGenerativeModel } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-ai.js';
import { config } from './config.js?v=appcheck-20261031';
export const app = initializeApp({
 apiKey:'AIzaSyBJPt9wTTb-pkxI0_9xv6eFAHoE2imyTIQ',authDomain:'honal-a0a82.firebaseapp.com',
 projectId:'honal-a0a82',storageBucket:'honal-a0a82.firebasestorage.app',messagingSenderId:'563434632790',
 appId:'1:563434632790:web:5f281c1e19145170a92df7',measurementId:'G-NQGFBB8E3K'
});
if(config.appCheckSiteKey) initializeAppCheck(app, {
 provider:new ReCaptchaEnterpriseProvider(config.appCheckSiteKey),isTokenAutoRefreshEnabled:true
});
let model;
export async function generateAIContent(payload) {
 if(!config.appCheckSiteKey) throw new Error('App Check 사이트 키 설정이 필요합니다.');
 model ||= getGenerativeModel(getAI(app,{backend:new GoogleAIBackend()}),{
  model:config.geminiModel,generationConfig:{temperature:0,responseMimeType:'application/json',maxOutputTokens:1200}
 });
 const result=await model.generateContent(payload);
 return result.response;
}
