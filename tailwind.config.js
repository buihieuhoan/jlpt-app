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
      },
    },
  },
  plugins: [],
}

