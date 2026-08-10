import React, { useState } from 'react';

interface SettingsScreenProps {
  currentLanguage: 'en' | 'id' | 'ar';
  onChangeLanguage: (lang: 'en' | 'id' | 'ar') => void;
  currentTheme: 'light' | 'dark' | 'system';
  onChangeTheme: (theme: 'light' | 'dark' | 'system') => void;
  fontSizeSp: number;
  onChangeFontSize: (size: number) => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  currentLanguage,
  onChangeLanguage,
  currentTheme,
  onChangeTheme,
  fontSizeSp,
  onChangeFontSize,
}) => {
  const [autoIndex, setAutoIndex] = useState(true);
  const [wifiOnly, setWifiOnly] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [lastOptimizedDate, setLastOptimizedDate] = useState('Oct 24, 2023');
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [cacheClearedMsg, setCacheClearedMsg] = useState<string | null>(null);

  const handleOptimizeNow = () => {
    setIsOptimizing(true);
    setTimeout(() => {
      setIsOptimizing(false);
      const today = new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      setLastOptimizedDate(today);
      setShowSnackbar(true);
      setTimeout(() => setShowSnackbar(false), 4000);
    }, 2000);
  };

  const handleClearCache = () => {
    setCacheClearedMsg('Cleared 450 MB temporary cache!');
    setTimeout(() => setCacheClearedMsg(null), 3000);
  };

  return (
    <div className="pb-28 max-w-2xl mx-auto px-4 space-y-6 pt-2">
      {/* Toast message */}
      {cacheClearedMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#00595c] text-white text-xs px-4 py-2 rounded-full shadow-lg">
          {cacheClearedMsg}
        </div>
      )}

      {/* STORAGE MANAGEMENT */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold text-[#735c00] uppercase tracking-widest px-1">
          Storage Management
        </h2>
        <div className="bg-[#f5f5dc] p-4 rounded-xl shadow-xs border border-[#bec9c9]/30 space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs text-[#3e4949] font-medium">
              <span>Total Usage</span>
              <span>1.2 GB / 5 GB</span>
            </div>
            <div className="h-2 bg-[#e4e4cc] rounded-full overflow-hidden">
              <div className="h-full bg-[#00595c] w-[24%] transition-all duration-1000 ease-out"></div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <button
              onClick={handleClearCache}
              className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-[#e4e4cc]/50 transition-all text-left w-full active:scale-98"
            >
              <span className="material-symbols-outlined text-[#00595c]">
                delete_sweep
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-xs text-[#1b1d0e]">Clear Cache</p>
                <p className="text-[11px] text-[#3e4949]">
                  Frees up 450 MB of temporary data
                </p>
              </div>
            </button>

            <button
              onClick={() => {
                setCacheClearedMsg('Database target shifted to SD Card storage.');
                setTimeout(() => setCacheClearedMsg(null), 3000);
              }}
              className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-[#e4e4cc]/50 transition-all text-left w-full active:scale-98"
            >
              <span className="material-symbols-outlined text-[#00595c]">
                sd_storage
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-xs text-[#1b1d0e]">
                  Move Database to SD Card
                </p>
                <p className="text-[11px] text-[#3e4949]">
                  Recommended for large libraries
                </p>
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* TOGGLES */}
      <section className="space-y-3">
        <div className="flex items-center justify-between p-4 bg-[#f5f5dc] rounded-xl border border-[#bec9c9]/30">
          <div className="flex flex-col pr-2">
            <span className="font-bold text-xs text-[#1b1d0e]">
              Auto-Index New Books
            </span>
            <span className="text-[11px] text-[#3e4949]">
              Scan library for updates on startup
            </span>
          </div>
          <button
            onClick={() => setAutoIndex(!autoIndex)}
            className={`w-11 h-6 rounded-full transition-colors relative flex items-center p-0.5 ${
              autoIndex ? 'bg-[#00696d]' : 'bg-[#bec9c9]'
            }`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full transition-transform shadow-xs ${
                autoIndex ? 'translate-x-5' : 'translate-x-0'
              }`}
            ></div>
          </button>
        </div>

        <div className="flex items-center justify-between p-4 bg-[#f5f5dc] rounded-xl border border-[#bec9c9]/30">
          <div className="flex flex-col pr-2">
            <span className="font-bold text-xs text-[#1b1d0e]">
              Download via Wi-Fi Only
            </span>
            <span className="text-[11px] text-[#3e4949]">
              Save mobile data by restricting downloads
            </span>
          </div>
          <button
            onClick={() => setWifiOnly(!wifiOnly)}
            className={`w-11 h-6 rounded-full transition-colors relative flex items-center p-0.5 ${
              wifiOnly ? 'bg-[#00696d]' : 'bg-[#bec9c9]'
            }`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full transition-transform shadow-xs ${
                wifiOnly ? 'translate-x-5' : 'translate-x-0'
              }`}
            ></div>
          </button>
        </div>
      </section>

      {/* BACKUP & RESTORE */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold text-[#735c00] uppercase tracking-widest px-1">
          Backup & Restore
        </h2>
        <div className="bg-[#f5f5dc] overflow-hidden rounded-xl shadow-xs border border-[#bec9c9]/30 divide-y divide-[#bec9c9]/20">
          <button
            onClick={() => {
              setCacheClearedMsg('Syncing backup with Google Drive...');
              setTimeout(() => setCacheClearedMsg(null), 3000);
            }}
            className="w-full flex items-center justify-between p-3.5 hover:bg-[#e4e4cc]/50 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[#00595c]">
                cloud_upload
              </span>
              <span className="font-bold text-xs text-[#1b1d0e]">
                Backup to Google Drive
              </span>
            </div>
            <span className="material-symbols-outlined text-[#3e4949] text-lg">
              chevron_right
            </span>
          </button>

          <button
            onClick={() => {
              setCacheClearedMsg('Exported local backup file to Downloads!');
              setTimeout(() => setCacheClearedMsg(null), 3000);
            }}
            className="w-full flex items-center justify-between p-3.5 hover:bg-[#e4e4cc]/50 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[#00595c]">save</span>
              <span className="font-bold text-xs text-[#1b1d0e]">Backup Locally</span>
            </div>
            <span className="material-symbols-outlined text-[#3e4949] text-lg">
              chevron_right
            </span>
          </button>

          <button
            onClick={() => {
              setCacheClearedMsg('Selected backup verified and restored!');
              setTimeout(() => setCacheClearedMsg(null), 3000);
            }}
            className="w-full flex items-center justify-between p-3.5 hover:bg-[#e4e4cc]/50 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[#00595c]">restore</span>
              <span className="font-bold text-xs text-[#1b1d0e]">
                Restore from Backup
              </span>
            </div>
            <span className="material-symbols-outlined text-[#3e4949] text-lg">
              chevron_right
            </span>
          </button>
        </div>
      </section>

      {/* APPEARANCE */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold text-[#735c00] uppercase tracking-widest px-1">
          Appearance
        </h2>
        <div className="bg-[#f5f5dc] p-4 rounded-xl shadow-xs border border-[#bec9c9]/30 space-y-5">
          {/* Theme Selector */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-[#3e4949] block">
              Theme Selection
            </label>
            <div className="flex gap-2">
              {(['light', 'dark', 'system'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => onChangeTheme(t)}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold capitalize transition-all border ${
                    currentTheme === t
                      ? 'border-[#00595c] bg-[#0d7377] text-[#a2f5f9]'
                      : 'border-[#bec9c9] hover:bg-[#e4e4cc]/50 text-[#1b1d0e]'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Font Size Slider */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <label className="text-[#3e4949] font-medium">Default Font Size</label>
              <span className="font-bold text-[#00595c]">{fontSizeSp}sp</span>
            </div>
            <input
              type="range"
              min="12"
              max="24"
              value={fontSizeSp}
              onChange={(e) => onChangeFontSize(Number(e.target.value))}
              className="w-full h-1.5 bg-[#e4e4cc] rounded-lg appearance-none cursor-pointer accent-[#00595c]"
            />
            <div className="flex justify-between text-xs text-[#3e4949] px-1 font-bold">
              <span>A</span>
              <span className="text-lg">A</span>
            </div>
          </div>

          {/* App Language */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-[#3e4949] block">
              App Language
            </label>
            <div className="space-y-2">
              {[
                { code: 'en', label: 'English' },
                { code: 'id', label: 'Bahasa Indonesia' },
                { code: 'ar', label: 'العربية' },
              ].map((lang) => (
                <label
                  key={lang.code}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                    currentLanguage === lang.code
                      ? 'border-[#00595c] bg-[#eaead1]'
                      : 'border-[#bec9c9]/30 hover:bg-[#e4e4cc]/30'
                  }`}
                >
                  <span className="text-xs font-bold text-[#1b1d0e]">
                    {lang.label}
                  </span>
                  <input
                    type="radio"
                    name="lang"
                    checked={currentLanguage === lang.code}
                    onChange={() => onChangeLanguage(lang.code as 'en' | 'id' | 'ar')}
                    className="w-4 h-4 text-[#00595c] focus:ring-[#00595c]"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* DATABASE OPTIMIZATION SYSTEM CARD */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold text-[#735c00] uppercase tracking-widest px-1">
          System
        </h2>
        <div className="bg-[#f5f5dc] p-5 rounded-xl shadow-xs border border-[#bec9c9]/30 text-center">
          <div className="mb-3">
            <span className="material-symbols-outlined text-[48px] text-[#00595c]/40">
              database
            </span>
          </div>
          <h3 className="font-title-lg text-lg font-bold text-[#1b1d0e] mb-1">
            Database Optimization
          </h3>
          <p className="text-xs text-[#3e4949] mb-5 max-w-sm mx-auto">
            Compress files and rebuild indices to improve search performance.
          </p>

          <div className="space-y-3">
            <button
              onClick={handleOptimizeNow}
              disabled={isOptimizing}
              className="w-full h-11 bg-[#00595c] text-white font-bold text-xs rounded-full shadow-md hover:bg-[#00595c]/90 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              {isOptimizing ? (
                <>
                  <span className="animate-spin material-symbols-outlined text-base">
                    sync
                  </span>
                  <span>Optimizing...</span>
                </>
              ) : (
                <span>Optimize Now</span>
              )}
            </button>
            <p className="text-[11px] text-[#3e4949]">
              Last optimized: {lastOptimizedDate}
            </p>
          </div>
        </div>
      </section>

      {/* Success Snackbar Toast */}
      {showSnackbar && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-[calc(100%-32px)] max-w-md bg-[#d1e7dd] text-[#0f5132] px-4 py-3 rounded-xl shadow-xl flex items-center justify-between z-50 animate-bounce">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">check_circle</span>
            <span className="text-xs font-bold">Database optimized successfully</span>
          </div>
          <button
            onClick={() => setShowSnackbar(false)}
            className="text-xs font-bold uppercase tracking-wider text-[#0f5132] hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
};
