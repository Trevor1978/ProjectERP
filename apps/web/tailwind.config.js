/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Gotham",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      colors: {
        tesla: {
          text: "#171a20",
          "text-secondary": "#5c5e62",
          muted: "#f4f4f4",
          border: "#e8e8e8",
          accent: "#e82127",
          header: "#171a20",
        },
      },
      borderRadius: {
        sm: "2px",
      },
    },
  },
  plugins: [],
};
