import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, Wifi } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useLanguage } from '../contexts/LanguageContext';

const NetworkStatusBar: React.FC = () => {
  const { isOnline, showRestored } = useNetworkStatus();
  const { t } = useLanguage();

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="bg-[var(--danger)] text-white text-xs font-medium flex items-center justify-center gap-2 py-1.5 px-4 z-[100]"
        >
          <WifiOff className="w-3.5 h-3.5" />
          {t.errors.networkOffline}
        </motion.div>
      )}
      {isOnline && showRestored && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="bg-[var(--success)] text-white text-xs font-medium flex items-center justify-center gap-2 py-1.5 px-4 z-[100]"
        >
          <Wifi className="w-3.5 h-3.5" />
          {t.errors.networkRestored}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NetworkStatusBar;
