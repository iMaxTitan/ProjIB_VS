import { Inter, Poppins, Fira_Code } from 'next/font/google';
import { Toaster } from 'sonner';
import '@/styles/globals.css';
import AuthProvider from './AuthProvider';

const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-inter' });
const poppins = Poppins({ weight: ['400', '500', '600', '700'], subsets: ['latin'], variable: '--font-poppins' });
const firaCode = Fira_Code({ weight: ['400', '500', '600', '700'], subsets: ['latin', 'cyrillic'], variable: '--font-fira-code' });

export const metadata = {
  title: 'CS Platform',
  description: 'Корпоративна платформа управління',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={`${inter.className} ${poppins.variable} ${firaCode.variable}`} suppressHydrationWarning>
        <AuthProvider>
          {children}
        </AuthProvider>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
} 