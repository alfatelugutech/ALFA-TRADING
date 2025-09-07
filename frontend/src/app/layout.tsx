export const metadata = {
  title: "Zerodha Auto Trader",
  description: "Live market ticks",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

