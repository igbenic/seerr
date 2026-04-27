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
@Index('IDX_TRAKT_WATCHED_SHOW_SUMMARY_USER_SHOW', ['userId', 'tmdbId'], {
  unique: true,
})
export class TraktWatchedShowSummary {
  constructor(init?: Partial<TraktWatchedShowSummary>) {
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
  @Index()
  public tmdbId: number;

  @Column({ type: 'int', default: 0 })
  public eligibleEpisodeCount: number;

  @Column({ type: 'int', default: 0 })
  public watchedEpisodeCount: number;

  @Column({ type: 'int', default: 0 })
  public eligibleSeasonCount: number;

  @Column({ type: 'int', default: 0 })
  public watchedSeasonCount: number;

  @DbAwareColumn({ type: 'datetime', nullable: true })
  public watchedAt?: Date | null;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public calculatedAt: Date;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @DbAwareColumn({
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  public updatedAt: Date;
}
