import { User } from '@server/entity/User';
import { DbAwareColumn } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
@Index(
  'IDX_TRAKT_WATCHED_EPISODE_USER_SHOW_EPISODE',
  ['userId', 'tmdbId', 'seasonNumber', 'episodeNumber'],
  {
    unique: true,
  }
)
@Index('IDX_TRAKT_WATCHED_EPISODE_USER_SHOW', ['userId', 'tmdbId'])
@Index('IDX_TRAKT_WATCHED_EPISODE_USER_SHOW_SEASON', [
  'userId',
  'tmdbId',
  'seasonNumber',
])
export class TraktWatchedEpisode {
  constructor(init?: Partial<TraktWatchedEpisode>) {
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

  @Column({ type: 'int' })
  public tmdbId: number;

  @Column({ type: 'int' })
  public seasonNumber: number;

  @Column({ type: 'int' })
  public episodeNumber: number;

  @Column({ type: 'int', default: 1 })
  public plays: number;

  @DbAwareColumn({ type: 'datetime' })
  @Index()
  public lastWatchedAt: Date;

  @DbAwareColumn({ type: 'datetime', nullable: true })
  public lastUpdatedAt?: Date | null;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @DbAwareColumn({
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  public updatedAt: Date;
}
