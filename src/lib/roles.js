// Единая точка правды для UI ролей. Зеркало SQL-массива v_special_roles в
// assign_trip_role() (supabase/schema.sql) — добавить роль = одна запись
// здесь + одна в том массиве + одна ветка jsonb_build_object.
export const ROLES = {
  prosecutor: {
    label: 'Прокурор',
    blurb: 'Удвоение веса голоса — 3 раза в день в этой роли.',
  },
  judge: {
    label: 'Верховный Судья',
    blurb: 'Слайдер до ±20 вместо ±10 — 2 заряда в этой роли.',
  },
  ghost: {
    label: 'Призрак',
    blurb: 'Анонимные жалобы без следа в истории — даже при отклонении.',
  },
  oligarch: {
    label: 'Олигарх',
    blurb: 'Кэшбэк 25% с первых 3 одобренных наград, поданных тобой.',
  },
  detective: {
    label: 'Детектив',
    blurb: 'Разоблачение автора закрытой жалобы — 2 заряда в этой роли.',
  },
  civilian: {
    label: 'Гражданин',
    blurb: 'Без особых способностей.',
  },
}

export const SPECIAL_ROLES = ['prosecutor', 'judge', 'ghost', 'oligarch', 'detective']
