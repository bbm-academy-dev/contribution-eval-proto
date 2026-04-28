# contribution-eval-proto

Одноразовый интерактивный инструмент для оценки вклада команды по итогам пилотного этапа BBM («Забег #1»).

Pure static, без бэкенда и БД. Деплой на Vercel.

## Использование

- `index.html` — форма для участника (заполняется по shared-ссылке от фасилитатора).
- `aggregate.html` — инструмент фасилитатора: setup якоря, визуализация весов, агрегация результатов.

## Локальный запуск

```bash
python -m http.server 4173
```

Открыть `http://127.0.0.1:4173/aggregate.html`.

## Vercel

Проект деплоится как static site из корня репозитория:

- Framework Preset: Other
- Build Command: пусто
- Output Directory: пусто
- Install Command: пусто

## Документация

- [SPEC.md](./SPEC.md) — полная спецификация.
- [Методология «Забег #1»](../outputs/2026-04-27-zabeg1-contribution-evaluation-design.md) — теоретическая основа.

## Стек

HTML + CSS + vanilla JS. Без билд-шага. Без зависимостей.
