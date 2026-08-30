import { defineConfig } from 'vite'
import { nexilPlugin } from '@nexil/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), nexilPlugin()],
})
