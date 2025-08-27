// tailwind.config.ts（核心片段）
import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 把“emerald”整体改成 iOS 蓝（#0A84FF 一带）
        emerald: {
          50:"#f0f7ff",100:"#e1efff",200:"#bedcff",300:"#8cc3ff",
          400:"#57a7ff",500:"#2f91ff",600:"#0a84ff",700:"#0063cc",
          800:"#004c99",900:"#003366"
        },
        // 保持危险为苹果红（#FF3B30）
        rose: {
          50:"#fff1f1",100:"#ffe1e1",200:"#ffc7c4",300:"#ffa19e",
          400:"#ff6f66",500:"#ff5246",600:"#ff3b30",700:"#d92b20",
          800:"#b32117",900:"#8c1b12"
        },
        // 警告用苹果橙（#FF9F0A）
        amber: {
          50:"#fff8ec",100:"#ffefd3",200:"#ffdf9e",300:"#ffcd66",
          400:"#ffb733",500:"#ffa40f",600:"#ff9f0a",700:"#e07f00",
          800:"#b76400",900:"#8a4b00"
        },
        // 细灰边/底
        slate: {
          50:"#f8f8fa",100:"#f2f2f6",200:"#e5e5ea",300:"#d1d1d6",
          400:"#c7c7cc",500:"#8e8e93",600:"#636366",700:"#3a3a3c",
          800:"#1c1c1e",900:"#0b0b0c"
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
