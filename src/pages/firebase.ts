import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCdmptttp85tyVUmX7cchyriW16By-wGk4",
  authDomain: "reaction-game-5b585.firebaseapp.com",
  databaseURL: "https://reaction-game-5b585-default-rtdb.firebaseio.com",
  projectId: "reaction-game-5b585",
  storageBucket: "reaction-game-5b585.firebasestorage.app",
  messagingSenderId: "98606291849",
  appId: "1:98606291849:web:889d4c482f3e8877f21f58",
  measurementId: "G-0HY4NH03E7"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);