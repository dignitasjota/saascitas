import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: 'SaaS Citas - Gestión de citas para técnicos',
  description:
    'Plataforma de gestión de citas y optimización de rutas para técnicos e instaladores.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={cn("font-sans", geist.variable)}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
