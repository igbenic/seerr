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
@Unique('UNIQUE_TRAKT_WATCHLIST_ENTRY', ['userId', 'watchlistEntryId'])
export class TraktWatchlist {
  constructor(init?: Partial<TraktWatchlist>) {
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
  public watchlistEntryId: number;

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

  @Column({ type: 'int', nullable: true })
  public year?: number | null;

  @Column({ type: 'int' })
  @Index()
  public rank: number;

  @DbAwareColumn({ type: 'datetime' })
  @Index()
  public listedAt: Date;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @DbAwareColumn({
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  public updatedAt: Date;
}
