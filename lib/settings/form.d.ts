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
import { type JevSettingKey, type JevSettings } from './fields.js';
/**
 * Staged text of every editable field, keyed by field name. The `enabled`
 * toggle is not staged: it writes on the click, so the switch that turns the
 * backend off stays one gesture away.
 */
export type JevDraft = Readonly<Record<string, string>>;
/** One field write a save submits. */
export interface JevWrite {
    /** Field inside the namespace section. */
    field: JevSettingKey;
    /** Value the staged text parsed to. */
    value: boolean | number | string;
}
/** Why staged text cannot be written. */
export type JevIssue = 'empty' | 'number' | 'range';
/**
 * Editable fields in presentation order: everything the toggle does not cover.
 * A field joins this list by its `kind`, so a boolean added to the table later
 * cannot silently start rendering as a text box.
 */
export declare const JEV_STAGED_FIELDS: readonly JevSettingKey[];
/**
 * Whether the user layer holds its own value for one field.
 * @param user - the raw user layer of the namespace snapshot.
 * @param field - field inside the namespace section.
 * @returns true when the field stands overridden.
 */
export declare function isOverridden(user: unknown, field: JevSettingKey): boolean;
/**
 * The text a draft starts from: the user's own value where one stands, else the
 * resolved value, so the page shows what the backend is actually obeying.
 * @param value - resolved namespace section.
 * @param user - the raw user layer of the namespace snapshot.
 * @returns staged text per editable field.
 */
export declare function draftFrom(value: JevSettings, user: unknown): JevDraft;
/**
 * Whether staged text is a value this field accepts.
 * @param field - field inside the namespace section.
 * @param text - staged text.
 * @returns the refusal, or undefined when the save may write it.
 */
export declare function issueOf(field: JevSettingKey, text: string): JevIssue | undefined;
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
export declare function planWrites(draft: JevDraft, user: unknown, value: JevSettings): JevWrite[];
