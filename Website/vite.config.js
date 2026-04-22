import { defineConfig } from 'vite'

export default defineConfig({
  // This ensures that all assets are linked relatively 
  // (so they work on github.io/repo-name/)
  base: './', 
  
  build: {
    // This makes the output easier to read if you're debugging
    minify: true,
    outDir: 'dist',
  }
})