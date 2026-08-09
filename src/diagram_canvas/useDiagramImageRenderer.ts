import { useCallback } from 'react';
import { getRectOfNodes, useReactFlow } from 'reactflow';
import { toPng } from 'html-to-image';

/** White space left around the diagram in the exported image. */
const EXPORT_PADDING_PX = 80;

/**
 * Device-pixel multiplier. Every CSS pixel becomes this many image pixels, so
 * text and strokes stay crisp when the image is viewed at full size or printed.
 */
const PREFERRED_PIXEL_RATIO = 3;

/**
 * Browser canvas limits. Chrome and Firefox refuse a canvas wider or taller than
 * 16384px, and run out of memory well before the nominal area limit, so the
 * pixel ratio is reduced rather than producing a blank image.
 */
const MAX_CANVAS_DIMENSION_PX = 16384;
const MAX_CANVAS_AREA_PX = 96_000_000;

/**
 * Renders the level currently on the canvas to a PNG data URL.
 *
 * The image is framed on the diagram's own bounding box rather than on whatever
 * the user has scrolled into view, so an export does not depend on where the
 * viewport happens to be sitting.
 *
 * The diagram is rendered at its natural size and then multiplied up by a pixel
 * ratio. It used to be squeezed into a fixed 1920x1080 frame, which meant a wide
 * context diagram — and a context diagram is wide, because the entities ring the
 * process — was scaled down until its flow labels were unreadable. Framing to the
 * content and oversampling instead keeps every label legible whatever the
 * diagram's shape.
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

        // Node bounds cover the boxes only; flow labels sit outside them, so the
        // padding has to be generous enough not to clip a label near an edge.
        const width = Math.ceil(diagramBounds.width + EXPORT_PADDING_PX * 2);
        const height = Math.ceil(diagramBounds.height + EXPORT_PADDING_PX * 2);

        const pixelRatio = Math.min(
            PREFERRED_PIXEL_RATIO,
            MAX_CANVAS_DIMENSION_PX / width,
            MAX_CANVAS_DIMENSION_PX / height,
            Math.sqrt(MAX_CANVAS_AREA_PX / (width * height))
        );

        return toPng(viewportElement, {
            backgroundColor: '#ffffff',
            width,
            height,
            pixelRatio: Math.max(1, pixelRatio),
            // Editing affordances do not belong in an exported diagram. The only
            // buttons inside the viewport are the per-flow direction toggles;
            // the zoom controls live outside it and are already excluded.
            filter: (domNode) => !(domNode instanceof HTMLButtonElement),
            style: {
                width: `${width}px`,
                height: `${height}px`,
                // Shift the diagram's top-left corner to the padding offset and
                // render at 1:1; the pixel ratio does the magnification.
                transform: `translate(${EXPORT_PADDING_PX - diagramBounds.x}px, ${EXPORT_PADDING_PX - diagramBounds.y}px) scale(1)`,
            },
        });
    }, [getNodes]);
}
