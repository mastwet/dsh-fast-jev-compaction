/**
 * The host half of `dsh-compaction-jev`: it owns the settings namespace every
 * Jev value lives in.
 *
 * The package's own bundle patch mounts it on the host plane, so the namespace
 * exists before any session mounts the compaction backend that reads it. Only
 * this half registers: the engine in an agent preset reads the same namespace
 * through the host's single settings provider, and a second registration would
 * fail loud.
 *
 * @module dsh-compaction-jev/settings
 */
import type { Context } from '@deepseek-ai/cordis';
/** Plugin name the loader reports. */
export declare const name = "dsh-compaction-jev-settings";
/** The settings provider is the only service this half needs. */
export declare const inject: string[];
/**
 * Register the namespace.
 *
 * An already-registered namespace is reported and left alone instead of thrown:
 * a duplicate mount is a composition mistake, and failing here would take the
 * whole plugin tree down while the registered namespace still serves the engine
 * correctly.
 * @param ctx - the host context to register on.
 */
export declare function apply(ctx: Context): void;
