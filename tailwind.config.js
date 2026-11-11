/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      // Mêmes tailles que l'A3 ERP (texte compact)
      fontSize: {
        xs: ['11px', '1.3'],
        sm: ['12px', '1.3'],
        base: ['13px', '1.35'],
        lg: ['16px', '1.3'],
        important: ['14px', '1.3'],
      },
    },
  },
  plugins: [],
}
