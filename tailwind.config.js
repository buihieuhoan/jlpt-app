/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      // Latin/Vietnamese use the sans fonts; Japanese glyphs fall through to
      // Mincho (the typeface used in printed JLPT papers).
      fontFamily: {
        sans: [
          '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial',
          '"Noto Serif JP"', '"Yu Mincho"', '"Hiragino Mincho ProN"', '"MS PMincho"', 'serif',
        ],
        // Whole run in Mincho (question sentences, like the printed exam paper)
        jp: ['"Noto Serif JP"', '"Yu Mincho"', '"Hiragino Mincho ProN"', '"MS PMincho"', 'serif'],
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
      },
    },
  },
  plugins: [],
}
