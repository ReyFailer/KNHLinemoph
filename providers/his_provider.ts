import type { ApplicationService } from '@adonisjs/core/types'

/**
 * HisProvider — placeholder for Phase 4. Will register dynamic
 * mysql2 connection pools from the his_databases table once the
 * Lucid manager is fully booted.
 */
export default class HisProvider {
  constructor(protected app: ApplicationService) {}

  register() {}
  async boot() {}
  async start() {}

  async ready() {
    // Phase 4: load his_databases rows + register pools via HisManager
  }

  async shutdown() {
    // Phase 4: close all dynamic HIS pools
  }
}
