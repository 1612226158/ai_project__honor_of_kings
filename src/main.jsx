import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// 样式与 Vue 版逐字节一致（复制自 heros-vue/src/style.css），模板自带的 index.css 不再引用。
import './style.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
