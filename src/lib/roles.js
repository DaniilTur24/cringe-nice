// Единая точка правды для UI ролей. Зеркало SQL-массива v_special_roles в
// assign_trip_role() (supabase/schema.sql) — добавить роль = одна запись
// здесь + одна в том массиве + одна ветка jsonb_build_object.
export const ROLES = {
  prosecutor: {
    label: 'Прокурор',
    blurb: 'Удвоение веса голоса — лимит зарядов в день задан для этой поездки.',
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
    blurb: 'Кэшбэк с первых одобренных наград, поданных тобой — % и лимит заданы для этой поездки.',
  },
  detective: {
    label: 'Детектив',
    blurb: 'Разоблачение автора закрытой жалобы — лимит зарядов в день задан для этой поездки.',
  },
  civilian: {
    label: 'Гражданин',
    blurb: 'Без особых способностей.',
  },
}

export const SPECIAL_ROLES = ['prosecutor', 'judge', 'ghost', 'oligarch', 'detective']
