/**
 * Draft and write planning for the Jev settings page.
 *
 * The page stages text; this module is the single place that decides what a
 * staged draft means — which text a field refuses, and which fields a save
 * actually writes. It holds no React and no DOM, so the rules are compiled with
 * the host half and tested without a browser, and the component stays
 * presentation.
 *
 * @module dsh-compaction-jev/settings/form
 */
import { JEV_SETTING_FIELDS, JEV_SETTING_ORDER, } from './fields.js';
/**
 * Editable fields in presentation order: everything the toggle does not cover.
 * A field joins this list by its `kind`, so a boolean added to the table later
 * cannot silently start rendering as a text box.
 */
export const JEV_STAGED_FIELDS = JEV_SETTING_ORDER.filter(key => JEV_SETTING_FIELDS[key].kind !== 'boolean');
/** Whether a stored layer carries its own value for one field. */
function carries(layer, field) {
    return typeof layer === 'object' && layer !== null && field in layer;
}
/**
 * Whether the user layer holds its own value for one field.
 * @param user - the raw user layer of the namespace snapshot.
 * @param field - field inside the namespace section.
 * @returns true when the field stands overridden.
 */
export function isOverridden(user, field) {
    return carries(user, field);
}
/**
 * The text a draft starts from: the user's own value where one stands, else the
 * resolved value, so the page shows what the backend is actually obeying.
 * @param value - resolved namespace section.
 * @param user - the raw user layer of the namespace snapshot.
 * @returns staged text per editable field.
 */
export function draftFrom(value, user) {
    const draft = {};
    for (const field of JEV_STAGED_FIELDS) {
        const standing = carries(user, field)
            ? user[field]
            : value[field];
        draft[field] = standing === undefined ? '' : String(standing);
    }
    return draft;
}
/**
 * Whether staged text is a value this field accepts.
 * @param field - field inside the namespace section.
 * @param text - staged text.
 * @returns the refusal, or undefined when the save may write it.
 */
export function issueOf(field, text) {
    const trimmed = text.trim();
    if (trimmed === '')
        return 'empty';
    const spec = JEV_SETTING_FIELDS[field];
    if (spec.kind !== 'number')
        return undefined;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed))
        return 'number';
    if (spec.min !== undefined && parsed < spec.min)
        return 'range';
    if (spec.max !== undefined && parsed > spec.max)
        return 'range';
    return undefined;
}
/** The value staged text writes for one field, once {@link issueOf} accepts it. */
function valueOf(field, text) {
    const trimmed = text.trim();
    return JEV_SETTING_FIELDS[field].kind === 'number' ? Number(trimmed) : trimmed;
}
/**
 * The writes a save submits: one per field whose staged text differs from what
 * already stands. Text that only restates the resolved value is skipped while
 * the field carries no override, so opening the page and saving it writes
 * nothing and leaves no overrides behind.
 * @param draft - staged text per editable field.
 * @param user - the raw user layer of the namespace snapshot.
 * @param value - resolved namespace section.
 * @returns writes to submit in presentation order; empty when nothing changed.
 */
export function planWrites(draft, user, value) {
    const writes = [];
    for (const field of JEV_STAGED_FIELDS) {
        const text = draft[field] ?? '';
        if (issueOf(field, text) !== undefined)
            continue;
        const next = valueOf(field, text);
        const standing = carries(user, field)
            ? user[field]
            : value[field];
        if (next === standing)
            continue;
        writes.push({ field, value: next });
    }
    return writes;
}
