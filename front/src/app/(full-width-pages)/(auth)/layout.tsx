import GridShape from "@/components/common/GridShape";
import ThemeTogglerTwo from "@/components/common/ThemeTogglerTwo";
import { ThemeProvider } from "@/context/ThemeContext";
import Image from "next/image";
import Link from "next/link";
import React from "react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative p-6 bg-white z-1 dark:bg-gray-900 sm:p-0">
      <ThemeProvider>
        <div className="relative flex lg:flex-row w-full h-screen justify-center flex-col dark:bg-gray-900 sm:p-0">
          {children}

          {/* Right panel — dark with yellow accents */}
          <div className="lg:w-1/2 w-full h-full bg-gray-950 lg:flex items-center justify-center hidden overflow-hidden relative">
            <GridShape />

            {/* Yellow glow behind logo */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full blur-3xl pointer-events-none" style={{ backgroundColor: '#fcbd1330' }} />

            <div className="relative z-10 flex flex-col items-center text-center px-12 -mt-16">
              <Link href="/" className="block mb-6">
                <Image
                  width={240}
                  height={240}
                  src="/images/logo/logo.webp"
                  alt="Pana Taxi"
                  className="drop-shadow-2xl"
                />
              </Link>

              <p className="text-2xl font-bold mb-4 leading-snug" style={{ color: '#fcbd13' }}>
                Más que un taxi,<br />un pana.
              </p>

              <p className="text-gray-400 text-sm max-w-xs leading-relaxed">
                Plataforma de gestión para cooperativas de taxi en Ecuador.
                Seguro, confiable y siempre a tu lado.
              </p>
            </div>
          </div>

          <div className="fixed bottom-6 right-6 z-50 block">
            <ThemeTogglerTwo />
          </div>
        </div>
      </ThemeProvider>
    </div>
  );
}
