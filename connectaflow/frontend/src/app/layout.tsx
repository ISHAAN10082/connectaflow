import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Connectaflow",
  description: "Signal-led GTM command center for account prioritization, messaging, execution, and outcomes.",
  icons: {
    icon: "/logo.jpg",
    shortcut: "/logo.jpg",
    apple: "/logo.jpg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased" suppressHydrationWarning>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#0B1009',
              border: '1px solid rgba(132, 255, 63, 0.16)',
              color: '#F5F7F3',
              fontSize: '13px',
              boxShadow: '0 18px 45px rgba(0,0,0,0.35)',
            },
          }}
          richColors
        />
      </body>
    </html>
  );
}
