/**
 * Zod schemas for runtime validation of API responses
 *
 * Catches API version mismatches and ensures type safety at runtime.
 *
 * This file re-exports all schemas from the modular src/schemas/ directory.
 * All schemas are now organized by domain for better maintainability.
 */

export * from './schemas/index.js';
