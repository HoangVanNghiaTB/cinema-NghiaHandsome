import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, host: true }, // host: cho điện thoại cùng Wi-Fi vào thử được
});
