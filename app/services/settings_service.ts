import SystemSetting from '#models/system_setting'

/**
 * SettingsService — in-memory key/value cache backed by the
 * system_settings table. First read loads the whole table; subsequent
 * reads come from cache. Writes go through `set()` which updates the
 * DB and invalidates the affected key.
 */
class SettingsServiceImpl {
  private cache: Map<string, string> | null = null

  private async ensureLoaded(): Promise<Map<string, string>> {
    if (this.cache) return this.cache
    const rows = await SystemSetting.all()
    this.cache = new Map(rows.map((r) => [r.settingKey, r.settingValue ?? '']))
    return this.cache
  }

  async get(key: string, fallback: string = ''): Promise<string> {
    const cache = await this.ensureLoaded()
    return cache.get(key) ?? fallback
  }

  async all(): Promise<Record<string, string>> {
    const cache = await this.ensureLoaded()
    return Object.fromEntries(cache)
  }

  async set(key: string, value: string, userId: number | null = null): Promise<void> {
    const row = (await SystemSetting.find(key)) ?? new SystemSetting()
    row.settingKey = key
    row.settingValue = value
    row.updatedBy = userId
    await row.save()
    if (this.cache) this.cache.set(key, value)
  }

  flush() {
    this.cache = null
  }
}

const SettingsService = new SettingsServiceImpl()
export default SettingsService
