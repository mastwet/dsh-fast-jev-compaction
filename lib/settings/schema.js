/**
 * The namespace schema, derived from the field table so each field's type,
 * default, and bounds are written exactly once and travel into the schema JSON
 * a configuration surface reads.
 *
 * @module dsh-compaction-jev/settings/schema
 */
import z from '@deepseek-ai/schemastery';
import { JEV_SETTINGS_DEFAULTS, JEV_SETTING_FIELDS, JEV_SETTING_ORDER, } from './fields.js';
/**
 * Build one number field's schema, holding it to the table's bounds.
 *
 * The table's `step` is deliberately not applied here: schemastery's `step` is a
 * multiple-of constraint, not a control increment, so it would reject a round
 * default the table itself declares, and a fractional step is not exactly
 * representable. The Settings page takes `step` as its increment and these
 * bounds as its range.
 * @param field - the field's table entry.
 * @param fallback - the field's default.
 * @returns the defaulted, bounded number schema.
 */
function numberSchema(field, fallback) {
    const withDefault = z.number().default(fallback);
    const bounded = field.min === undefined ? withDefault : withDefault.min(field.min);
    return field.max === undefined ? bounded : bounded.max(field.max);
}
/**
 * Build one field's schema from its table entry.
 * @param key - the field to build.
 * @returns the schema, defaulted and bounded per the table.
 */
function fieldSchema(key) {
    const field = JEV_SETTING_FIELDS[key];
    const fallback = JEV_SETTINGS_DEFAULTS[key];
    switch (field.kind) {
        case 'boolean':
            return z.boolean().default(fallback);
        case 'number':
            return numberSchema(field, fallback);
        case 'string':
            return z.string().default(fallback);
    }
}
const dict = Object.fromEntries(JEV_SETTING_ORDER.map((key) => [key, fieldSchema(key)]));
/**
 * The `dsh-compaction-jev` namespace schema.
 *
 * `settings.register` resolves the stored user section through it, so both the
 * engine and the Settings page read a value that already carries every field.
 */
export const JevSettingsSchema = z.object(dict);
