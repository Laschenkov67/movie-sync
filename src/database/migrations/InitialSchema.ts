import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema implements MigrationInterface {
  name = 'InitialSchema';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS genres (
        id   integer PRIMARY KEY,
        name text NOT NULL
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS movies (
        id                 integer PRIMARY KEY,
        title              text NOT NULL,
        original_title     text,
        overview           text,
        release_date       date,
        release_year       integer,
        popularity         double precision NOT NULL DEFAULT 0,
        vote_average       double precision NOT NULL DEFAULT 0,
        vote_count         integer NOT NULL DEFAULT 0,
        poster_path        text,
        backdrop_path      text,
        original_language  text,
        adult              boolean NOT NULL DEFAULT false,
        runtime            integer,
        status             text,
        tagline            text,
        content_hash       text,
        source_updated_at  timestamptz,
        created_at         timestamptz NOT NULL DEFAULT now(),
        updated_at         timestamptz NOT NULL DEFAULT now(),
        deleted_at         timestamptz
      );
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_movies_release_year      ON movies (release_year);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_movies_popularity        ON movies (popularity DESC);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_movies_source_updated_at ON movies (source_updated_at);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_movies_deleted_at        ON movies (deleted_at);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_movies_title_trgm        ON movies USING gin (title gin_trgm_ops);`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS movie_genres (
        movie_id integer NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
        genre_id integer NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
        PRIMARY KEY (movie_id, genre_id)
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_movie_genres_genre_id ON movie_genres (genre_id);`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sync_state (
        id                text PRIMARY KEY,
        last_started_at   timestamptz,
        last_finished_at  timestamptz,
        cursor_at         timestamptz,
        status            text NOT NULL DEFAULT 'idle',
        updated_count     integer NOT NULL DEFAULT 0,
        created_count     integer NOT NULL DEFAULT 0,
        deleted_count     integer NOT NULL DEFAULT 0,
        failed_count      integer NOT NULL DEFAULT 0,
        last_error        text,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      INSERT INTO sync_state (id) VALUES ('movies')
      ON CONFLICT (id) DO NOTHING;
    `);

    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS movie_genres;`);
    await queryRunner.query(`DROP TABLE IF EXISTS sync_state;`);
    await queryRunner.query(`DROP TABLE IF EXISTS movies;`);
    await queryRunner.query(`DROP TABLE IF EXISTS genres;`);
  }
}