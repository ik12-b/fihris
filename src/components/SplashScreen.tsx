import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  onFinish: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(onFinish, 400);
          return 100;
        }
        return prev + 4;
      });
    }, 80);

    return () => clearInterval(interval);
  }, [onFinish]);

  return (
    <div 
      onClick={onFinish}
      className="fixed inset-0 z-50 bg-[#00595c] flex flex-col items-center justify-between text-white cursor-pointer select-none overflow-hidden"
    >
      {/* Background Radial Glow */}
      <div className="absolute inset-0 opacity-15 pointer-events-none">
        <div className="w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/30 via-transparent to-transparent"></div>
      </div>

      {/* Top balance spacer */}
      <div className="h-16"></div>

      {/* Center: App Logo Icon */}
      <div className="flex flex-col items-center justify-center animate-float relative z-10 px-4">
        <div className="relative">
          {/* Subtle Glow */}
          <div className="absolute inset-0 bg-[#00595c] rounded-full blur-3xl opacity-30 scale-150"></div>
          
          {/* Cream Rounded Book + Search Icon Container */}
          <div className="w-36 h-36 md:w-48 md:h-48 bg-[#f5f5dc] rounded-[32px] flex items-center justify-center shadow-2xl border border-white/20 relative group">
            <div className="relative w-full h-full flex items-center justify-center">
              <span className="material-symbols-outlined text-[72px] md:text-[96px] text-[#00595c]">
                menu_book
              </span>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mt-4 ml-4">
                <div className="bg-[#0d7377] p-2 md:p-2.5 rounded-full border-4 border-[#f5f5dc] shadow-lg">
                  <span className="material-symbols-outlined text-[#a2f5f9] text-[20px] md:text-[28px] font-bold">
                    search
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Branding & Loading Bar */}
      <div className="w-full flex flex-col items-center pb-16 px-6 relative z-10">
        <h1 className="font-serif-scholar text-6xl md:text-8xl text-[#f5f5dc] tracking-wide mb-2 transition-all duration-700">
          Fihris
        </h1>
        <p className="font-label-lg text-[13px] md:text-[15px] text-[#81d4d8] tracking-[0.2em] uppercase opacity-90 mb-10 text-center">
          Pencarian Kitab & Manuskrip
        </p>

        {/* Progress Bar with Gold Accent */}
        <div className="w-56 md:w-72 h-[3px] bg-white/15 rounded-full overflow-hidden relative shadow-inner">
          <div 
            className="h-full bg-[#ffe088] shadow-[0_0_12px_rgba(255,224,136,0.8)] transition-all duration-100 ease-out"
            style={{ width: `${progress}%` }}
          ></div>
        </div>

        {/* Status Label */}
        <p className="mt-4 text-xs text-[#81d4d8]/80 animate-pulse font-medium">
          Memuat Perpustakaan Digital ({progress}%)...
        </p>
        <p className="mt-2 text-[10px] text-white/40 uppercase tracking-widest">
          Ketuk untuk masuk
        </p>
      </div>

      {/* Subtle Golden Edge Glow */}
      <div className="absolute bottom-0 w-full h-1 bg-gradient-to-r from-transparent via-[#ffe088]/40 to-transparent"></div>
    </div>
  );
};
