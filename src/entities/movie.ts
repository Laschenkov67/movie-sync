import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Genre } from './genre';

@Entity('movies')
@Index('idx_movies_release_year', ['releaseYear'])
@Index('idx_movies_popularity', ['popularity'])
@Index('idx_movies_source_updated_at', ['sourceUpdatedAt'])
export class Movie {
  /** TMDB movie id is the natural primary key — гарантирует идемпотентность upsert-ов. */
  @PrimaryColumn('integer')
  id: number;

  @Column('text')
  title: string;

  @Column('text', { name: 'original_title', nullable: true })
  originalTitle: string | null;

  @Column('text', { nullable: true })
  overview: string | null;

  @Column('date', { name: 'release_date', nullable: true })
  releaseDate: string | null;

  @Column('integer', { name: 'release_year', nullable: true })
  releaseYear: number | null;

  @Column('double precision', { default: 0 })
  popularity: number;

  @Column('double precision', { name: 'vote_average', default: 0 })
  voteAverage: number;

  @Column('integer', { name: 'vote_count', default: 0 })
  voteCount: number;

  @Column('text', { name: 'poster_path', nullable: true })
  posterPath: string | null;

  @Column('text', { name: 'backdrop_path', nullable: true })
  backdropPath: string | null;

  @Column('text', { name: 'original_language', nullable: true })
  originalLanguage: string | null;

  @Column('boolean', { default: false })
  adult: boolean;

  @Column('integer', { nullable: true })
  runtime: number | null;

  @Column('text', { nullable: true })
  status: string | null;

  @Column('text', { nullable: true })
  tagline: string | null;

  /**
   * Хэш «значимых» полей последнего полученного ответа TMDB.
   * Используется как локальный ETag — если хэш не изменился, БД не трогаем.
   */
  @Column('text', { name: 'content_hash', nullable: true })
  contentHash: string | null;

  /** updated-маркер, который сообщает TMDB (через /movie/changes или поле). */
  @Column('timestamptz', { name: 'source_updated_at', nullable: true })
  sourceUpdatedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  /** Soft delete для записей, исчезнувших из TMDB. */
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @ManyToMany(() => Genre, (g) => g.movies, { cascade: false })
  @JoinTable({
    name: 'movie_genres',
    joinColumn: { name: 'movie_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'genre_id', referencedColumnName: 'id' },
  })
  genres: Genre[];
}
