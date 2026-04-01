import { useState } from 'react';

export function useMultiSelect() {
    const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);

    return { selectionBox, setSelectionBox };
}