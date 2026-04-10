import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTraktWatchedState1779000000000 implements MigrationInterface {
  name = 'AddTraktWatchedState1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "traktWatchStateLastSyncAt" datetime`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "traktWatchStateLastSyncAttemptAt" datetime`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "traktWatchStateBootstrappedAt" datetime`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "traktWatchStateLastActivityAt" datetime`
    );
    await queryRunner.query(
      `CREATE TABLE "trakt_watched_media" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "mediaType" varchar NOT NULL, "tmdbId" integer NOT NULL, "traktId" integer, "tvdbId" integer, "imdbId" varchar, "title" varchar NOT NULL, "year" integer, "plays" integer NOT NULL DEFAULT (1), "lastWatchedAt" datetime NOT NULL, "lastUpdatedAt" datetime, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), CONSTRAINT "FK_8a2d3819c81d0db59ee7b89b77f" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_TRAKT_WATCHED_MEDIA_USER_MEDIA_TMBD" ON "trakt_watched_media" ("userId", "mediaType", "tmdbId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ff825ec4328db778958eb1b281" ON "trakt_watched_media" ("userId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7fb3283356ef8424be2dc65c53" ON "trakt_watched_media" ("tmdbId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6f51cf2458db8284d9f5e8518e" ON "trakt_watched_media" ("traktId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8c9f0d6b5f01efb64c4eb11d47" ON "trakt_watched_media" ("lastWatchedAt") `
    );
    await queryRunner.query(
      `CREATE TABLE "trakt_watched_episode" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "tmdbId" integer NOT NULL, "seasonNumber" integer NOT NULL, "episodeNumber" integer NOT NULL, "plays" integer NOT NULL DEFAULT (1), "lastWatchedAt" datetime NOT NULL, "lastUpdatedAt" datetime, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), CONSTRAINT "FK_802b355af52c1c71c91a16d555f" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_TRAKT_WATCHED_EPISODE_USER_SHOW_EPISODE" ON "trakt_watched_episode" ("userId", "tmdbId", "seasonNumber", "episodeNumber") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2db4728634f40ca094c6fcf7d5" ON "trakt_watched_episode" ("userId", "tmdbId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_15d353a274f688a7a81091cf85" ON "trakt_watched_episode" ("userId", "tmdbId", "seasonNumber") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4a99114a40bf4d593cb8a17dae" ON "trakt_watched_episode" ("userId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9e95c0147f2b4f3b56ec3b768f" ON "trakt_watched_episode" ("lastWatchedAt") `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_9e95c0147f2b4f3b56ec3b768f"`);
    await queryRunner.query(`DROP INDEX "IDX_4a99114a40bf4d593cb8a17dae"`);
    await queryRunner.query(`DROP INDEX "IDX_15d353a274f688a7a81091cf85"`);
    await queryRunner.query(`DROP INDEX "IDX_2db4728634f40ca094c6fcf7d5"`);
    await queryRunner.query(
      `DROP INDEX "IDX_TRAKT_WATCHED_EPISODE_USER_SHOW_EPISODE"`
    );
    await queryRunner.query(`DROP TABLE "trakt_watched_episode"`);
    await queryRunner.query(`DROP INDEX "IDX_8c9f0d6b5f01efb64c4eb11d47"`);
    await queryRunner.query(`DROP INDEX "IDX_6f51cf2458db8284d9f5e8518e"`);
    await queryRunner.query(`DROP INDEX "IDX_7fb3283356ef8424be2dc65c53"`);
    await queryRunner.query(`DROP INDEX "IDX_ff825ec4328db778958eb1b281"`);
    await queryRunner.query(
      `DROP INDEX "IDX_TRAKT_WATCHED_MEDIA_USER_MEDIA_TMBD"`
    );
    await queryRunner.query(`DROP TABLE "trakt_watched_media"`);
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "traktWatchStateLastActivityAt"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "traktWatchStateBootstrappedAt"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "traktWatchStateLastSyncAttemptAt"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "traktWatchStateLastSyncAt"`
    );
  }
}
