export const metadata: { title: string; description: string } = {
  title: "Zerodha Auto Trader",
  description: "Live market ticks",
};

import "./styles.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="page">{children}</body>
    </html>
  );
}

