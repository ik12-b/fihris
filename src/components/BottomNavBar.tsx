import React from 'react';
import { TabType } from '../types';

interface BottomNavBarProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  language?: 'en' | 'id' | 'ar';
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({ activeTab, onSelectTab, language = 'id' }) => {
  const getLabel = (tab: TabType) => {
    if (language === 'id') {
      switch (tab) {
        case 'home': return 'Beranda';
        case 'search': return 'Cari';
        case 'library': return 'Perpustakaan';
        case 'store': return 'Toko';
        case 'settings': return 'Pengaturan';
        default: return tab;
      }
    }
    if (language === 'ar') {
      switch (tab) {
        case 'home': return 'الرئيسية';
        case 'search': return 'بحث';
        case 'library': return 'المكتبة';
        case 'store': return 'المتجر';
        case 'settings': return 'الإعدادات';
        default: return tab;
      }
    }
    // English
    switch (tab) {
      case 'home': return 'Home';
      case 'search': return 'Search';
      case 'library': return 'Library';
      case 'store': return 'Store';
      case 'settings': return 'Settings';
      default: return tab;
    }
  };

  const navItems: { tab: TabType; icon: string }[] = [
    { tab: 'home', icon: 'home' },
    { tab: 'search', icon: 'search' },
    { tab: 'library', icon: 'local_library' },
    { tab: 'store', icon: 'store' },
    { tab: 'settings', icon: 'settings' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex justify-around items-center px-2 py-2 pb-safe bg-[#fbfbe2] border-t border-[#bec9c9]/30 shadow-[0_-2px_12px_rgba(0,0,0,0.06)] rounded-t-xl max-w-4xl mx-auto">
      {navItems.map((item) => {
        const isActive = activeTab === item.tab;
        return (
          <button
            key={item.tab}
            onClick={() => onSelectTab(item.tab)}
            className={`flex flex-col items-center justify-center transition-all duration-150 py-1 ${
              isActive
                ? 'bg-[#0d7377] text-[#a2f5f9] rounded-full px-4 py-1 shadow-sm scale-95'
                : 'text-[#3e4949] hover:text-[#00595c] px-3'
            }`}
          >
            <span
              className={`material-symbols-outlined ${isActive ? 'filled' : ''}`}
              style={{ fontSize: '22px' }}
            >
              {item.icon}
            </span>
            <span className="text-[11px] font-medium tracking-tight mt-0.5">
              {getLabel(item.tab)}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
