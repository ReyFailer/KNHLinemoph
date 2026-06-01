import vine from '@vinejs/vine'

export const hisDatabaseSaveValidator = vine.compile(
  vine.object({
    id: vine.any().optional(),
    name: vine.string().trim().regex(/^[a-zA-Z0-9_]+$/).minLength(1).maxLength(50),
    host: vine.string().trim().minLength(1).maxLength(120),
    port: vine.number().withoutDecimals().min(1).max(65_535).optional(),
    username: vine.string().trim().minLength(1).maxLength(80),
    password: vine.string().maxLength(255).optional(),
    database_name: vine.string().trim().minLength(1).maxLength(80),
    description: vine.string().trim().maxLength(255).optional(),
    is_active: vine.accepted().optional(),
    is_default: vine.accepted().optional(),
  })
)
