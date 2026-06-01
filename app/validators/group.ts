import vine from '@vinejs/vine'

export const groupSaveValidator = vine.compile(
  vine.object({
    id: vine.any().optional(),
    group_name: vine.string().trim().minLength(1).maxLength(100),
    client_key: vine.string().trim().minLength(1).maxLength(255),
    secret_key: vine.string().trim().minLength(1).maxLength(255),
    api_url: vine.string().url({ require_tld: false }).optional(),
    is_active: vine.accepted().optional(),
  })
)
