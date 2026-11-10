/**
 * Shared shape of one row in the canvas context menu.
 *
 * The rete context-menu preset only defines label/key/handler/subitems. The
 * editor renderer adds presentation fields so every row carries an icon and
 * actions can show their live shortcut chip. Keeping the type in one place
 * lets the item factory, the icons table and the Vue renderer agree.
 */
import type { OnshapeSvgIcon } from "../components/SvgIcon.vue";

export interface EditorContextMenuItem {
    label: string;
    key: string;
    handler: () => void | Promise<void>;
    subitems?: EditorContextMenuItem[];
    /** Leading monochrome icon (sprite symbol). Every visible row has one. */
    icon?: OnshapeSvgIcon;
    /** Right-aligned keycap chip text, e.g. `Ctrl+C`. */
    shortcut?: string;
    /** Draw a heavier hairline above this row (section break). */
    sectionStart?: boolean;
}
