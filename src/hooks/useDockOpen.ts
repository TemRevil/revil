import { TOUCH_QUERY } from '../lib/device';
import useMediaQuery from './useMediaQuery';

/**
 * True on a mouse or trackpad screen, where the contact and CV modals open from the navbar
 * (`dockRise`); false on phones and tablets, which use the blur fade. Same split as the
 * page layout (see lib/device.ts).
 */
export default function useDockOpen() {
    return !useMediaQuery(TOUCH_QUERY);
}
