/*
|--------------------------------------------------------------------------
| Edge globals
|--------------------------------------------------------------------------
*/

import edge from 'edge.js'
import { DateTime } from 'luxon'

edge.global('appName', () => 'KNH MOPH Notify System')
edge.global('appVersion', '2.2.2')

edge.global('formatThaiDate', (input: string | Date | DateTime | null | undefined) => {
  if (!input) return ''
  const dt =
    input instanceof DateTime
      ? input
      : input instanceof Date
        ? DateTime.fromJSDate(input)
        : DateTime.fromISO(String(input))
  if (!dt.isValid) return String(input)
  const thaiMonths = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
  ]
  return `${dt.day} ${thaiMonths[dt.month - 1]} ${dt.year + 543} ${dt.toFormat('HH:mm')}`
})

edge.global('thaiDay', (n: number) => {
  const days = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']
  return days[((n - 1) % 7 + 7) % 7] ?? ''
})
