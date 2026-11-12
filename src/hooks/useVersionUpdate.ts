import { useCallback, useEffect, useState } from 'react';
import { APP_VERSION } from '@/config/version';

export const useVersionUpdate = () => {
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const [previousVersion, setPreviousVersion] = useState<string | null>(null);

  useEffect(() => {
    const storedVersion = localStorage.getItem('app_version');
    const notificationShownForVersion = localStorage.getItem('notification_shown_version');
    
    if (!storedVersion) {
      // Primeira instalação não é uma "atualização". Apenas estabelece a base.
      localStorage.setItem('app_version', APP_VERSION);
    } else if (storedVersion !== APP_VERSION) {
      if (notificationShownForVersion !== APP_VERSION) {
        setPreviousVersion(storedVersion);
        setShowUpdateNotification(true);
      } else {
        // Compatibilidade com versões que já marcaram a novidade como vista.
        localStorage.setItem('app_version', APP_VERSION);
      }
    }
  }, []);

  const dismissNotification = useCallback(() => {
    localStorage.setItem('app_version', APP_VERSION);
    localStorage.setItem('notification_shown_version', APP_VERSION);
    setShowUpdateNotification(false);
  }, []);

  const markNotificationShown = useCallback(() => {
    localStorage.setItem('app_version', APP_VERSION);
    localStorage.setItem('notification_shown_version', APP_VERSION);
  }, []);

  return {
    showUpdateNotification,
    previousVersion,
    currentVersion: APP_VERSION,
    markNotificationShown,
    dismissNotification,
  };
};
