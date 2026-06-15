import { Column, Entity, ManyToMany, PrimaryColumn } from 'typeorm';

import { Movie } from './movie';

@Entity('genres')
export class Genre {
  @PrimaryColumn('integer')
  id: number;

  @Column('text')
  name: string;

  @ManyToMany(() => Movie, (m) => m.genres)
  movies: Movie[];
}