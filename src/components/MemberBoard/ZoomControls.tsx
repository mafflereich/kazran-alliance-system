import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { useControls } from 'react-zoom-pan-pinch';

export default function ZoomControls() {
    const { zoomIn, zoomOut, resetTransform } = useControls();

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-1.5 bg-gray-900/95 backdrop-blur-md border border-gray-700 rounded-xl p-2 shadow-2xl">
            <button
                onClick={() => zoomIn()}
                className="p-2 hover:bg-gray-800 rounded-lg transition text-gray-300 hover:text-indigo-300"
                title="放大"
            >
                <ZoomIn size={18} />
            </button>

            <button
                onClick={() => zoomOut()}
                className="p-2 hover:bg-gray-800 rounded-lg transition text-gray-300 hover:text-indigo-300"
                title="縮小"
            >
                <ZoomOut size={18} />
            </button>

            <button
                onClick={() => resetTransform()}
                className="p-2 hover:bg-gray-800 rounded-lg transition text-gray-300 hover:text-indigo-300"
                title="重置視圖"
            >
                <RotateCcw size={18} />
            </button>
        </div>
    );
}