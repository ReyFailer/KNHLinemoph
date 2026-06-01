import vine from '@vinejs/vine'

export const settingsSaveValidator = vine.compile(
  vine.object({
    site_title: vine.string().trim().maxLength(100).optional(),
    org_name: vine.string().trim().maxLength(200).optional(),
    site_footer: vine.string().trim().maxLength(200).optional(),
    default_api_url: vine.string().url({ require_tld: false }).optional(),
  })
)
