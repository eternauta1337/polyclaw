/**
 * Config validation using OpenClaw's Zod schema
 */
/**
 * Ensure openclaw is installed and built at ~/.openclaw/openclaw/
 */
export declare function ensureOpenclawInstalled(): boolean;
export interface ValidationIssue {
    path: string;
    message: string;
}
export interface ValidationResult {
    ok: boolean;
    issues: ValidationIssue[];
}
/**
 * Validate an OpenClaw config object against the schema
 */
export declare function validateOpenClawConfig(config: Record<string, unknown>): Promise<ValidationResult>;
/**
 * Print validation errors to console
 */
export declare function printValidationErrors(context: string, issues: ValidationIssue[]): void;
//# sourceMappingURL=validate.d.ts.map