import vine from '@vinejs/vine'

export const userSaveValidator = vine.compile(
  vine.object({
    id: vine.any().optional(),
    username: vine.string().trim().regex(/^[a-zA-Z0-9_.\-]+$/).minLength(2).maxLength(60),
    display_name: vine.string().trim().minLength(1).maxLength(120),
    role: vine.enum(['admin', 'operator', 'viewer'] as const),
    password: vine.string().minLength(6).maxLength(255).optional(),
    is_active: vine.accepted().optional(),
  })
)

export const userPasswordValidator = vine.compile(
  vine.object({
    current_password: vine.string().minLength(1),
    new_password: vine.string().minLength(6).maxLength(255),
  })
)
