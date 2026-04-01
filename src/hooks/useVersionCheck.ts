import { useState, useEffect, useCallback } from 'react';

/**
 * 自訂 Hook：定時檢查版本號，判斷是否有新版本發布
 * @param checkIntervalMinutes 檢查間隔時間 (分鐘)
 */
export function useVersionCheck(checkIntervalMinutes: number = 5) {
  const [hasNewVersion, setHasNewVersion] = useState<boolean>(false);
  const [initialVersion, setInitialVersion] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    // 取得當前版本號的函式
    const fetchVersion = async () => {
      try {
        // 加上時間戳記強迫繞過瀏覽器快取 (Cache Busting)
        const timestamp = new Date().getTime();
        const response = await fetch(`${import.meta.env.BASE_URL}meta.json?t=${timestamp}`, {
          cache: 'no-store',
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch meta.json');
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          throw new Error('Response is not JSON');
        }

        const data = await response.json();
        const currentVersion = data.version;

        if (!isMounted) return;

        setInitialVersion((prevVersion) => {
          if (prevVersion === null) {
            // 初次載入，記錄版本號
            return currentVersion;
          } else if (currentVersion !== prevVersion) {
            // 發現新版本
            setHasNewVersion(true);
          }
          return prevVersion;
        });
      } catch (error) {
        console.error('[Version Check] Error fetching version:', error);
      }
    };

    // 初次執行檢查
    fetchVersion();

    // 設定定時器
    const intervalId = setInterval(fetchVersion, checkIntervalMinutes * 60 * 1000);

    // 清除定時器
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [checkIntervalMinutes]);

  // 強制重整頁面的函式
  const reloadPage = useCallback(() => {
    // 重新載入頁面，強迫瀏覽器抓取最新資源
    window.location.reload();
  }, []);

  return { hasNewVersion, reloadPage };
}
