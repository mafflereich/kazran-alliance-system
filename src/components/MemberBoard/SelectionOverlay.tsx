type Props = {
    selectionBox: { startX: number; startY: number; endX: number; endY: number } | null;
    onSelectionEnd: (ids: Set<string>) => void;
};

export default function SelectionOverlay({ selectionBox, onSelectionEnd }: Props) {
    if (!selectionBox) return null;

    const left = Math.min(selectionBox.startX, selectionBox.endX);
    const top = Math.min(selectionBox.startY, selectionBox.endY);
    const width = Math.abs(selectionBox.endX - selectionBox.startX);
    const height = Math.abs(selectionBox.endY - selectionBox.startY);

    return (
        <div
            className="fixed pointer-events-none border-2 border-blue-500 bg-blue-500/15 z-40"
            style={{
                left: `${left}px`,
                top: `${top}px`,
                width: `${width}px`,
                height: `${height}px`,
            }}
        />
    );
}