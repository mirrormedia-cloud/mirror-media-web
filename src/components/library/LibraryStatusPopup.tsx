/**
 * Status popup — post-R2, library rows are always "completed" (a row
 * only exists when the R2 upload succeeded). This component is kept as
 * a compatibility shim so existing call sites don't break, but it
 * renders nothing because there's no failed/in-progress state to
 * surface anymore.
 */

import React from 'react';
import { LibraryItem } from '../../types';

interface Props {
    item: LibraryItem | null;
    busy?: boolean;
    onClose: () => void;
    onReupload: () => void;
}

export const LibraryStatusPopup: React.FC<Props> = (_props: Props) => {
    return null;
};
