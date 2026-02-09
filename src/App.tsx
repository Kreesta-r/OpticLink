import './styles/theme.css';
import MainLayout from './components/Layout/MainLayout';
import PhoneClient from './components/PhoneClient';

function App() {
  // Route based on URL hash:
  // #phone = Phone client view (camera streaming)
  // default = Desktop main layout
  const isPhone = window.location.hash === '#phone';

  if (isPhone) {
    return <PhoneClient />;
  }

  return <MainLayout />;
}

export default App;
