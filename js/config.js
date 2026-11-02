// Public configuration only. Never place a Gemini API secret here.
export const config = {
  appCheckSiteKey: '6LdudAwuAAAAALx8hNoTNUV3dOXD5D4h45ZwjjFx', // Firebase App Check > reCAPTCHA Enterprise public site key
  geminiModel: 'gemini-3-flash-preview',
  cloudEnabled: false // Enable only after deploying firestore.rules and configuring Auth/App Check.
};
