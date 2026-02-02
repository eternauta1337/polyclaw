/**
 * init command - Copy templates to current directory
 */

import { copyTemplates } from "../lib/templates.js";

export function initCommand(): void {
  copyTemplates(process.cwd());
}
