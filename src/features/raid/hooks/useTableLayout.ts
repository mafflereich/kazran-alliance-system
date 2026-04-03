import { useState, useEffect } from 'react';

export function useTableLayout(
  selectedSeasonId: string,
  isComparisonMode: boolean,
  sortConfig: { key: 'default' | 'score'; order: 'asc' | 'desc' }
) {
  const [rowHeights, setRowHeights] = useState<Record<number, number>>({});
  const [headerHeight, setHeaderHeight] = useState(0);
  const [theadHeight, setTheadHeight] = useState(0);

  useEffect(() => {
    setRowHeights({});
    setHeaderHeight(0);
    setTheadHeight(0);
  }, [selectedSeasonId, isComparisonMode, sortConfig]);

  const handleRowHeightChange = (index: number, height: number) => {
    setRowHeights(prev => {
      if ((prev[index] || 0) < height) return { ...prev, [index]: height };
      return prev;
    });
  };

  const handleHeaderHeightChange = (height: number) => {
    setHeaderHeight(prev => Math.max(prev, height));
  };

  const handleTheadHeightChange = (height: number) => {
    setTheadHeight(prev => Math.max(prev, height));
  };

  return {
    rowHeights,
    headerHeight,
    theadHeight,
    handleRowHeightChange,
    handleHeaderHeightChange,
    handleTheadHeightChange,
  };
}
