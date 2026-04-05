import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        gameBgA: "#0b1021",
        gameBgB: "#1b2a4a",
        gameAccent: "#39d98a",
      },
      keyframes: {
        boom: {
          "0%": { transform: "scale(1)", opacity: "1", filter: "saturate(1)" },
          "40%": { transform: "scale(1.3)", opacity: "0.98" },
          "100%": { transform: "scale(0.35)", opacity: "0", filter: "saturate(2.2)" },
        },
      },
      animation: {
        boom: "boom 360ms ease-out forwards",
      },
    },
  },
  plugins: [],
};

export default config;
