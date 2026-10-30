import localFont from "next/font/local";

/** Pax Civil (brand typeface): Regular for body, Medium for buttons/CTA, Bold for headings. */
export const paxCivil = localFont({
  src: [
    { path: "../fonts/PaxCivil-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/PaxCivil-Medium.woff2", weight: "500", style: "normal" },
    { path: "../fonts/PaxCivil-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-pax-civil",
  display: "swap",
  fallback: ["Arial", "system-ui", "sans-serif"],
});
