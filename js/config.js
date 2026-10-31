// Public configuration only. Never place a Gemini API secret here.
export const config = {
  appCheckSiteKey: '6LfZXwkuAAAAALppMiNG9EaPnkY60NJ08twR9Ji5', // Firebase App Check > reCAPTCHA Enterprise public site key
  geminiModel: 'gemini-3-flash-preview',
  cloudEnabled: false // Enable only after deploying firestore.rules and configuring Auth/App Check.
};
