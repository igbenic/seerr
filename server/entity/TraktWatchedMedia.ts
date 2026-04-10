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
} from 'typeorm';

@Entity()
@Index(
  'IDX_TRAKT_WATCHED_MEDIA_USER_MEDIA_TMBD',
  ['userId', 'mediaType', 'tmdbId'],
  {
    unique: true,
  }
)
export class TraktWatchedMedia {
  constructor(init?: Partial<TraktWatchedMedia>) {
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

  @Column({ type: 'varchar' })
  public mediaType: MediaType;

  @Column({ type: 'int' })
  @Index()
  public tmdbId: number;

  @Column({ type: 'int', nullable: true })
  @Index()
  public traktId?: number | null;

  @Column({ type: 'int', nullable: true })
  public tvdbId?: number | null;

  @Column({ type: 'varchar', nullable: true })
  public imdbId?: string | null;

  @Column({ type: 'varchar' })
  public title: string;

  @Column({ type: 'int', nullable: true })
  public year?: number | null;

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
