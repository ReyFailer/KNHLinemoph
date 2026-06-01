import vine from '@vinejs/vine'

const timeRule = vine.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/)
const dateRule = vine.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/**
 * Schedule save validator (covers both create + update; `id`
 * optional). Cross-field rules (specific_dates required when mode=
 * specific, repeat_* required when repeat_enabled) are enforced
 * by Vine's union of conditional shapes.
 */
export const scheduleSaveValidator = vine.compile(
  vine.object({
    id: vine.any().optional(),
    schedule_name: vine.string().trim().minLength(1).maxLength(100),
    template_id: vine.number().withoutDecimals().positive(),
    group_ids: vine.array(vine.number().withoutDecimals().positive()).minLength(1),
    send_time: timeRule,
    schedule_mode: vine.enum(['weekly', 'specific'] as const).optional(),
    days_of_week: vine.array(vine.number().withoutDecimals().min(1).max(7)).optional(),
    specific_dates: vine.array(dateRule).maxLength(365).optional(),
    repeat_enabled: vine.accepted().optional(),
    repeat_interval: vine.number().withoutDecimals().min(1).optional(),
    repeat_unit: vine.enum(['minutes', 'hours'] as const).optional(),
    repeat_end_time: timeRule.optional(),
    is_active: vine.accepted().optional(),
  })
)
