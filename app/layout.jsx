import './globals.css';

export const metadata = {
  title: 'Bluezone Habitat | Daily Accounts',
  description: 'Bluezone Habitat Daily Accounts Approval and Expense Tracking Studio',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#123547',
  colorScheme: 'light',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
