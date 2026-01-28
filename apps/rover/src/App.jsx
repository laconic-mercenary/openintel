import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

//
// Components
import Login from './components/Login';
import Rover from './components/Rover';


//
// App

function App() {

  // State
  const [count, setCount] = useState(0)
  
  // DOM
  return (
    // <Login />
    <Rover />
  )
}

export default App
