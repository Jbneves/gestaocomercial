import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "estao-comercial-web.firebaseapp.com",
  databaseURL: "COLOQUE_AQUI_A_URL_DO_REALTIME_DATABASE",
  projectId: "estao-comercial-web",
  storageBucket: "estao-comercial-web.firebasestorage.app",
  messagingSenderId: "895007956126",
  appId: "1:895007956126:web:cdc1bd6ca20f499921ef8f"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app);
