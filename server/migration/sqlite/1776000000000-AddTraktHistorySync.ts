import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTraktHistorySync1776000000000 implements MigrationInterface {
  name = 'AddTraktHistorySync1776000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "traktHistorySyncEnabled" boolean NOT NULL DEFAULT (0)`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "traktHistoryLastSyncAt" datetime`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "traktHistoryLastSyncAttemptAt" datetime`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "traktHistoryLatestWatchedAt" datetime`
    );
    await queryRunner.query(
      `CREATE TABLE "trakt_history" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "historyId" integer NOT NULL, "source" varchar NOT NULL, "mediaType" varchar NOT NULL, "traktId" integer, "tmdbId" integer, "tvdbId" integer, "imdbId" varchar, "title" varchar NOT NULL, "episodeTitle" varchar, "year" integer, "seasonNumber" integer, "episodeNumber" integer, "watchedAt" datetime NOT NULL, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), CONSTRAINT "UNIQUE_TRAKT_HISTORY_EVENT" UNIQUE ("userId", "historyId"), CONSTRAINT "FK_1ea1ff81c3f82fd1cfb6546fd6b" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1ef530f4f2f68b18bc0f1dc1b1" ON "trakt_history" ("userId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4ae64b94889267f4ee76bb1d59" ON "trakt_history" ("historyId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_205e0dfa6c0c34f0b72a358403" ON "trakt_history" ("traktId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8ad764015ca3f8d114f7db1264" ON "trakt_history" ("tmdbId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3cab2666a58d9d6f1f5ddf33c4" ON "trakt_history" ("watchedAt") `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_3cab2666a58d9d6f1f5ddf33c4"`);
    await queryRunner.query(`DROP INDEX "IDX_8ad764015ca3f8d114f7db1264"`);
    await queryRunner.query(`DROP INDEX "IDX_205e0dfa6c0c34f0b72a358403"`);
    await queryRunner.query(`DROP INDEX "IDX_4ae64b94889267f4ee76bb1d59"`);
    await queryRunner.query(`DROP INDEX "IDX_1ef530f4f2f68b18bc0f1dc1b1"`);
    await queryRunner.query(`DROP TABLE "trakt_history"`);
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "traktHistoryLatestWatchedAt"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "traktHistoryLastSyncAttemptAt"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "traktHistoryLastSyncAt"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "traktHistorySyncEnabled"`
    );
  }
}
