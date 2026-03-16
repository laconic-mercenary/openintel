import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css'

import Login from './components/Login';
import Rover from './components/Rover';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<Rover />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
