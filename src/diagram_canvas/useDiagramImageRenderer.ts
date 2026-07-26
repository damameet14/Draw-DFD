import { useCallback } from 'react';
import { getRectOfNodes, getTransformForBounds, useReactFlow } from 'reactflow';
import { toPng } from 'html-to-image';

/** Pixel size of the exported image, independent of the on-screen viewport. */
const EXPORT_IMAGE_WIDTH = 1920;
const EXPORT_IMAGE_HEIGHT = 1080;

const EXPORT_MIN_ZOOM = 0.3;
const EXPORT_MAX_ZOOM = 2;

/**
 * Renders the level currently on the canvas to a PNG data URL.
 *
 * The image is framed on the diagram's own bounding box rather than on whatever
 * the user has scrolled into view, so an export does not depend on where the
 * viewport happens to be sitting.
 *
 * Must be called from inside `DiagramCanvasProvider`, which is what gives this
 * hook access to the live node positions.
 */
export function useDiagramImageRenderer(): () => Promise<string> {
    const { getNodes } = useReactFlow();

    return useCallback(async () => {
        const nodes = getNodes();
        if (nodes.length === 0) {
            throw new Error('There is nothing on this level to export yet.');
        }

        const viewportElement = document.querySelector<HTMLElement>('.react-flow__viewport');
        if (!viewportElement) {
            throw new Error('The canvas is not ready yet.');
        }

        const diagramBounds = getRectOfNodes(nodes);
        const [translateX, translateY, zoom] = getTransformForBounds(
            diagramBounds,
            EXPORT_IMAGE_WIDTH,
            EXPORT_IMAGE_HEIGHT,
            EXPORT_MIN_ZOOM,
            EXPORT_MAX_ZOOM
        );

        return toPng(viewportElement, {
            backgroundColor: '#ffffff',
            width: EXPORT_IMAGE_WIDTH,
            height: EXPORT_IMAGE_HEIGHT,
            // Editing affordances do not belong in an exported diagram. The only
            // buttons inside the viewport are the per-flow direction toggles;
            // the zoom controls live outside it and are already excluded.
            filter: (domNode) => !(domNode instanceof HTMLButtonElement),
            style: {
                width: `${EXPORT_IMAGE_WIDTH}px`,
                height: `${EXPORT_IMAGE_HEIGHT}px`,
                transform: `translate(${translateX}px, ${translateY}px) scale(${zoom})`,
            },
        });
    }, [getNodes]);
}
