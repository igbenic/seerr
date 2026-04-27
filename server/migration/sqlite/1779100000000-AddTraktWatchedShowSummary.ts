import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTraktWatchedShowSummary1779100000000 implements MigrationInterface {
  name = 'AddTraktWatchedShowSummary1779100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "trakt_watched_show_summary" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "tmdbId" integer NOT NULL, "eligibleEpisodeCount" integer NOT NULL DEFAULT (0), "watchedEpisodeCount" integer NOT NULL DEFAULT (0), "eligibleSeasonCount" integer NOT NULL DEFAULT (0), "watchedSeasonCount" integer NOT NULL DEFAULT (0), "watchedAt" datetime, "calculatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), CONSTRAINT "FK_5f880a56fe0daecf0606bc0faab" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_TRAKT_WATCHED_SHOW_SUMMARY_USER_SHOW" ON "trakt_watched_show_summary" ("userId", "tmdbId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_226cd55d71dcdd48ecb0df3eb7" ON "trakt_watched_show_summary" ("userId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9d069d2759666a7a4129e05e40" ON "trakt_watched_show_summary" ("tmdbId") `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_9d069d2759666a7a4129e05e40"`);
    await queryRunner.query(`DROP INDEX "IDX_226cd55d71dcdd48ecb0df3eb7"`);
    await queryRunner.query(
      `DROP INDEX "IDX_TRAKT_WATCHED_SHOW_SUMMARY_USER_SHOW"`
    );
    await queryRunner.query(`DROP TABLE "trakt_watched_show_summary"`);
  }
}
