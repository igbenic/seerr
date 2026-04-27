import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTraktWatchedShowSummary1779100000000 implements MigrationInterface {
  name = 'AddTraktWatchedShowSummary1779100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "trakt_watched_show_summary" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "tmdbId" integer NOT NULL, "eligibleEpisodeCount" integer NOT NULL DEFAULT '0', "watchedEpisodeCount" integer NOT NULL DEFAULT '0', "eligibleSeasonCount" integer NOT NULL DEFAULT '0', "watchedSeasonCount" integer NOT NULL DEFAULT '0', "watchedAt" TIMESTAMP, "calculatedAt" TIMESTAMP NOT NULL DEFAULT now(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0101d4cccd2b4567e575d19052d" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_TRAKT_WATCHED_SHOW_SUMMARY_USER_SHOW" ON "trakt_watched_show_summary" ("userId", "tmdbId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c9c648a4cbdbf33cb3d8b196f4" ON "trakt_watched_show_summary" ("userId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_31dfc5265578d9093bd731b2b6" ON "trakt_watched_show_summary" ("tmdbId") `
    );
    await queryRunner.query(
      `ALTER TABLE "trakt_watched_show_summary" ADD CONSTRAINT "FK_5f880a56fe0daecf0606bc0faab" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "trakt_watched_show_summary" DROP CONSTRAINT "FK_5f880a56fe0daecf0606bc0faab"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_31dfc5265578d9093bd731b2b6"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c9c648a4cbdbf33cb3d8b196f4"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_TRAKT_WATCHED_SHOW_SUMMARY_USER_SHOW"`
    );
    await queryRunner.query(`DROP TABLE "trakt_watched_show_summary"`);
  }
}
