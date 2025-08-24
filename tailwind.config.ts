// 根目录 /tailwind.config.ts
import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",   // 如果你有 /components 目录
  ],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
