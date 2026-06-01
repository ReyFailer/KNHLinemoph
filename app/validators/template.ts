import vine from '@vinejs/vine'

export const templateSaveValidator = vine.compile(
  vine.object({
    id: vine.any().optional(),
    template_name: vine.string().trim().minLength(1).maxLength(100),
    template_content: vine.string().minLength(1),
    is_active: vine.accepted().optional(),
  })
)
