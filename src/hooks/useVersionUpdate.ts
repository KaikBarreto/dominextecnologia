import { useEffect, useState } from 'react';
import { APP_VERSION } from '@/config/version';

export const useVersionUpdate = () => {
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const [previousVersion, setPreviousVersion] = useState<string | null>(null);

  useEffect(() => {
    const storedVersion = localStorage.getItem('app_version');
    const notificationShownForVersion = localStorage.getItem('notification_shown_version');
    
    if (storedVersion && storedVersion !== APP_VERSION && notificationShownForVersion !== APP_VERSION) {
      setPreviousVersion(storedVersion);
      setShowUpdateNotification(true);
      localStorage.setItem('notification_shown_version', APP_VERSION);
    }
    
    localStorage.setItem('app_version', APP_VERSION);
  }, []);

  const dismissNotification = () => {
    setShowUpdateNotification(false);
  };

  return {
    showUpdateNotification,
    previousVersion,
    currentVersion: APP_VERSION,
    dismissNotification,
  };
};
