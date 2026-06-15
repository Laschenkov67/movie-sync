import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type SyncStatus = 'idle' | 'running' | 'success' | 'failed' | 'partial';

@Entity('sync_state')
export class SyncState {
  /**
   * В таблице ровно одна строка с id='movies' — это удобнее, чем отдельная per-run таблица,
   * для read-only ручки /sync/status. Для аудита можно завести sync_runs (опционально).
   */
  @PrimaryColumn('text')
  id: string;

  @Column('timestamptz', { name: 'last_started_at', nullable: true })
  lastStartedAt: Date | null;

  @Column('timestamptz', { name: 'last_finished_at', nullable: true })
  lastFinishedAt: Date | null;

  /** Курсор для /movie/changes — нижняя граница следующего инкремента. */
  @Column('timestamptz', { name: 'cursor_at', nullable: true })
  cursorAt: Date | null;

  @Column('text', { default: 'idle' })
  status: SyncStatus;

  @Column('integer', { name: 'updated_count', default: 0 })
  updatedCount: number;

  @Column('integer', { name: 'created_count', default: 0 })
  createdCount: number;

  @Column('integer', { name: 'deleted_count', default: 0 })
  deletedCount: number;

  @Column('integer', { name: 'failed_count', default: 0 })
  failedCount: number;

  @Column('text', { name: 'last_error', nullable: true })
  lastError: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}