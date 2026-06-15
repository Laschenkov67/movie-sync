# Movie Sync Service

Backend-сервис, который инкрементально синхронизирует каталог фильмов TMDB в PostgreSQL и отдаёт REST API.

## Запуск
```bash
cp .env.example .env
# впишите TMDB_API_KEY
docker compose up --build
```

После старта:
- API: http://localhost:3000
- Health: `GET /health/live`, `GET /health/ready`
- Метрики Prometheus: `GET /metrics`
- Статус синка: `GET /sync/status`
- Каталог: `GET /movies?year=2023&genreId=28&sortBy=popularity&sortOrder=desc&page=1&pageSize=20`
- Деталь: `GET /movies/:id`

Миграции запускаются автоматически в `command` контейнера `app`.

## Разработка
```bash
npm ci
npm run dev
npm run lint
npm test
npm run typecheck
```

## Схема БД

`movies` — основная таблица:
- `id integer PRIMARY KEY` — TMDB id (натуральный ключ → идемпотентный upsert).
- бизнес-поля + `content_hash` (sha1 от стабильных полей) — локальный ETag, не апдейтим строку, если ничего значимого не поменялось.
- `source_updated_at` — момент, когда мы в последний раз увидели запись в TMDB.
- `deleted_at` — soft delete для записей, исчезнувших из источника (adult-фильтр или 404).
- Индексы: `release_year`, `popularity DESC`, `source_updated_at`, `deleted_at`, `title` (gin/trgm).

`genres` + `movie_genres` — many-to-many с собственными PK от TMDB.

`sync_state` — одна строка `id='movies'`:
- `cursor_at` — нижняя граница диапазона для следующего `/movie/changes` (last successful sync time).
- `status` (`idle|running|success|partial|failed`), счётчики, `last_error`.

## Логика синхронизации — «почему так»

1. **Первичный backfill** (`initialBackfill`) дёргает `/movie/popular` для первых `INITIAL_SYNC_PAGES` страниц и кладёт `movieId` в BullMQ-очередь. Делается единоразово, если в БД пусто.
2. **Инкрементальный синк** по cron (`SYNC_CRON`):
   - Берём `cursor_at` (если нет — `now - 24h`).
   - Постранично читаем `/movie/changes?start_date=cursor&end_date=now`.
   - Помеченные `adult=true` (которые мы не храним) → soft delete.
   - Остальные `id` → BullMQ-задачи `sync-movie` (jobId = `movie:{id}` → автодедуп).
3. **Worker** для каждой задачи делает `/movie/{id}`, считает `content_hash`, делает upsert в транзакции вместе с жанрами.
4. **Курсор двигается** только при `success`/`partial`. При полном `failed` диапазон будет переигран на следующем запуске — гарантия отсутствия пропусков.
5. **Stale running** — при старте сервиса вызывается `recoverStaleRun()`: если предыдущий процесс упал в состоянии `running`, статус переводится в `failed`, курсор НЕ двигается.

### Идемпотентность

- PK на TMDB id → одинаковые входы дают одинаковый результат.
- `content_hash` фильтрует «холостые» апдейты.
- BullMQ `jobId = movie:{id}` исключает дубли активных задач.
- Soft delete переводит запись в «удалена», повторный приход тех же данных её «воскрешает» (`deleted_at = null`).

### Обработка ошибок

- `axios-retry` с экспоненциальным backoff + jitter.
- `429` → ждём `Retry-After` (если есть), иначе backoff.
- `5xx` и сетевые ошибки → ретраи (до 5).
- Падение посреди синка → `status='failed'`, курсор не двигается, ошибки сетевые/частичные → `status='partial'`, курсор двигается, упавшие задачи остаются в очереди и переретраиваются BullMQ (`attempts: 5`).

### Rate limiting

Token-bucket в `RateLimiter`, лимит `TMDB_RATE_LIMIT_RPS` (по умолчанию 40 req/s — с запасом до TMDB-шных ~50).

### Graceful shutdown

`SIGINT`/`SIGTERM` → останавливаем cron, BullMQ worker, очередь, HTTP сервер, DataSource. Таймаут 15с, после — `process.exit(1)`.

## Конфигурация

Все настройки через env (см. `.env.example`). Конфиг валидируется Zod-схемой на старте — невалидное окружение немедленно завершает процесс.

## Метрики

- `sync_runs_total{status}`, `sync_duration_seconds`
- `movies_upserted_total`, `movies_soft_deleted_total`
- `tmdb_requests_total{endpoint,status}`
- `queue_jobs_total{status}`
- `http_request_duration_seconds{method,route,status}`
- + default Node.js process metrics