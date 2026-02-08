import { useState } from "react";
import "./App.css";
import DesktopViewer from "./components/DesktopViewer";
import PhoneClient from "./components/PhoneClient";

function App() {
  // Simple router for MVP: 
  // If URL hash is #phone, show PhoneClient.
  // Else show DesktopViewer.
  const [isPhone] = useState(window.location.hash === '#phone');

  return (
    <main className="container">
      {isPhone ? <PhoneClient /> : <DesktopViewer />}
    </main>
  );
}

export default App;
