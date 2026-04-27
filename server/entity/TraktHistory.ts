import type { MediaType } from '@server/constants/media';
import { User } from '@server/entity/User';
import { DbAwareColumn } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity()
@Unique('UNIQUE_TRAKT_HISTORY_EVENT', ['userId', 'historyId'])
export class TraktHistory {
  constructor(init?: Partial<TraktHistory>) {
    Object.assign(this, init);
  }

  @PrimaryGeneratedColumn()
  public id: number;

  @Column()
  @Index()
  public userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  public user: User;

  @Column()
  @Index()
  public historyId: number;

  @Column({ type: 'varchar' })
  public source = 'trakt' as const;

  @Column({ type: 'varchar' })
  public mediaType: MediaType;

  @Column({ type: 'int', nullable: true })
  @Index()
  public traktId?: number | null;

  @Column({ type: 'int', nullable: true })
  @Index()
  public tmdbId?: number | null;

  @Column({ type: 'int', nullable: true })
  public tvdbId?: number | null;

  @Column({ type: 'varchar', nullable: true })
  public imdbId?: string | null;

  @Column({ type: 'varchar' })
  public title: string;

  @Column({ type: 'varchar', nullable: true })
  public episodeTitle?: string | null;

  @Column({ type: 'int', nullable: true })
  public year?: number | null;

  @Column({ type: 'int', nullable: true })
  public seasonNumber?: number | null;

  @Column({ type: 'int', nullable: true })
  public episodeNumber?: number | null;

  @DbAwareColumn({ type: 'datetime' })
  @Index()
  public watchedAt: Date;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @DbAwareColumn({
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  public updatedAt: Date;
}
