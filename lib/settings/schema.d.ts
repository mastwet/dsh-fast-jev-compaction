/**
 * The namespace schema, derived from the field table so each field's type,
 * default, and bounds are written exactly once and travel into the schema JSON
 * a configuration surface reads.
 *
 * @module dsh-compaction-jev/settings/schema
 */
import z from '@deepseek-ai/schemastery';
import { type JevSettings } from './fields.js';
/**
 * The `dsh-compaction-jev` namespace schema.
 *
 * `settings.register` resolves the stored user section through it, so both the
 * engine and the Settings page read a value that already carries every field.
 */
export declare const JevSettingsSchema: z<JevSettings>;
