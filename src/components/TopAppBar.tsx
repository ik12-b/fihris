import React from 'react';

interface TopAppBarProps {
  title: string;
  subtitle?: string;
  onOpenDrawer?: () => void;
  onOpenProfile?: () => void;
  rightActionIcon?: string;
  onRightAction?: () => void;
}

export const TopAppBar: React.FC<TopAppBarProps> = ({
  title,
  subtitle,
  onOpenDrawer,
  onOpenProfile,
  rightActionIcon,
  onRightAction,
}) => {
  return (
    <header className="bg-[#fbfbe2] sticky top-0 z-30 shadow-xs flex items-center justify-between px-4 w-full h-16 max-w-4xl mx-auto border-b border-[#bec9c9]/20">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenDrawer}
          className="p-2 rounded-full hover:bg-[#e4e4cc]/50 text-[#00595c] transition-colors active:scale-95"
          title="Menu"
        >
          <span className="material-symbols-outlined">menu</span>
        </button>
        <div>
          <h1 className="font-title-lg text-lg md:text-xl font-bold text-[#00595c] leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-[#3e4949] font-medium">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {rightActionIcon && onRightAction && (
          <button
            onClick={onRightAction}
            className="p-2 rounded-full hover:bg-[#e4e4cc]/50 text-[#00595c] transition-colors active:scale-95"
          >
            <span className="material-symbols-outlined">{rightActionIcon}</span>
          </button>
        )}

        <button
          onClick={onOpenProfile}
          className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00595c] to-[#0d7377] text-[#fbfbe2] font-amiri font-bold text-lg flex items-center justify-center shadow-xs border border-[#735c00]/40 hover:ring-2 hover:ring-[#00595c] transition-all active:scale-95 shrink-0"
          title="Fihris - Aplikasi Kitab"
        >
          <span className="select-none leading-none pt-0.5">ف</span>
        </button>
      </div>
    </header>
  );
};
